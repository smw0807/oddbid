#!/usr/bin/env python3
"""Exercise deployment/rollback using the real Bash script and fake service CLIs.

Every writable path lives under TemporaryDirectory. Docker, AWS, curl, id,
flock and sleep are intercepted; this test needs no root, daemon or network.
Run from any directory with: python3 deploy/update-server.test.py
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys

ROOT = Path(__file__).resolve().parents[1]
OLD = 'a' * 40
NEW = 'b' * 40
REGISTRY = '123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/oddbid'
MOCK = r'''
import fcntl, json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
root = pathlib.Path(os.environ['MOCK_STATE_DIR']).resolve()
assert root.is_dir() and root.name.startswith('oddbid-deployment-test-')
state_file = root / 'state.json'
state = json.loads(state_file.read_text()) if state_file.exists() else {}
with (root / 'commands.jsonl').open('a') as f: f.write(json.dumps([name, *args]) + '\n')
mode = os.environ['MOCK_MODE']
new = 'b' * 40
def save(): state_file.write_text(json.dumps(state))
if name == 'id': print('0')
elif name == 'flock':
    if mode == 'locked': sys.exit(1)
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
elif name == 'sleep': pass
elif name == 'aws': print('mock-password')
elif name == 'curl':
    revision = state.get('revision', '')
    if mode in ('health-fail', 'first-fail') and revision == new: revision = 'unexpected'
    if mode == 'tls-fail' and revision == new and args[-1].startswith('https:'): sys.exit(22)
    print(json.dumps({'ok': True, 'service': 'oddbid', 'revision': revision}))
elif name == 'docker':
    if args[0] == 'login': sys.stdin.read()
    elif args[0] == 'pull':
        if mode == 'pull-fail': sys.exit(1)
    elif args[0] == 'inspect': print(state.get('image', '') + '|healthy')
    elif args[0] == 'compose':
        envpath = pathlib.Path(args[args.index('--env-file') + 1]).resolve()
        config = args[args.index('-f') + 1]
        assert root in envpath.parents, 'environment file escaped temporary test directory'
        assert root in pathlib.Path(config).resolve().parents, 'configuration escaped temporary test directory'
        assert 'APP_REVISION' not in os.environ, 'ambient Compose variable was not removed'
        values = dict(line.split('=', 1) for line in envpath.read_text().splitlines() if '=' in line)
        command = args[args.index('-f') + 2:]
        if command[0] == 'ps':
            if state.get('image'): print('mock-container')
        elif command[0] == 'up':
            if command[-1] == 'backend':
                state['image'] = values['ODDBID_IMAGE']
                state['revision'] = values['APP_REVISION']
                state['backend_config'] = config
            else: state['caddy_config'] = config
            save()
        elif command[0] == 'rm':
            state = {}; save()
        elif command[0] not in ('config', 'pull', 'run'): raise RuntimeError(command)
    else: raise RuntimeError(args)
else: raise RuntimeError(name)
'''


def run_case(mode: str, previous: bool = True) -> None:
    with tempfile.TemporaryDirectory(prefix='oddbid-deployment-test-') as temp:
        base = Path(temp).resolve()
        bin_dir = base / 'bin'
        bin_dir.mkdir()
        for command in ('id', 'flock', 'sleep', 'aws', 'docker', 'curl'):
            target = bin_dir / command
            target.write_text(f'#!{sys.executable}\n{MOCK}', encoding='utf-8')
            target.chmod(0o755)
        deploy = base / 'deployment'
        new_release = deploy / 'releases' / f'{NEW}-2-1'
        old_release = deploy / 'releases' / f'{OLD}-1-1'
        for release in (new_release, old_release):
            release.mkdir(parents=True)
            for filename in ('update-server.sh', 'compose.yaml', 'Caddyfile'):
                shutil.copy(ROOT / 'deploy' / filename, release / filename)
        initial_env = 'API_DOMAIN=api.example.com\nCADDY_EMAIL=admin@example.com\n'
        state = {}
        if previous:
            initial_env += f'ODDBID_IMAGE={REGISTRY}:{OLD}-1-1\nAPP_REVISION={OLD}\nODDBID_RELEASE_DIR={old_release}\n'
            state = {'image': f'{REGISTRY}:{OLD}-1-1', 'revision': OLD, 'backend_config': str(old_release / 'compose.yaml'), 'caddy_config': str(old_release / 'compose.yaml')}
        (deploy / '.env').write_text(initial_env)
        (deploy / 'server.env').write_text('ALLOWED_ORIGINS=https://example.com\n')
        previous_saved = '# Previously saved rollback state must survive failures.\n'
        if previous:
            (deploy / 'previous.env').write_text(previous_saved)
        (base / 'state.json').write_text(json.dumps(state))
        env = dict(
            os.environ,
            PATH=f'{bin_dir}:' + os.environ.get('PATH', os.defpath),
            ODDBID_DEPLOY_DIR=str(deploy),
            ODDBID_HEALTH_ATTEMPTS='1',
            ODDBID_TLS_ATTEMPTS='1',
            MOCK_STATE_DIR=str(base),
            MOCK_MODE=mode,
        )
        # Also prove ambient Compose variables cannot override the env-file.
        env['APP_REVISION'] = 'stale-shell-value'
        result = subprocess.run(
            ['bash', str(new_release / 'update-server.sh'), f'{REGISTRY}:{NEW}-2-1', NEW, 'ap-northeast-2'],
            cwd=base,
            env=env,
            text=True,
            capture_output=True,
            timeout=30,
        )
        final_state = json.loads((base / 'state.json').read_text())
        if mode == 'success':
            assert result.returncode == 0, result.stderr
            assert f'APP_REVISION={NEW}' in (deploy / '.env').read_text()
            if previous:
                assert (deploy / 'previous.env').read_text() == initial_env
            assert final_state['revision'] == NEW
            assert final_state['backend_config'] == str(new_release / 'compose.yaml')
            assert final_state['caddy_config'] == str(new_release / 'compose.yaml')
        else:
            assert result.returncode != 0, result.stdout
            assert (deploy / '.env').read_text() == initial_env
            if previous:
                assert final_state['revision'] == OLD, final_state
                assert final_state['backend_config'] == str(old_release / 'compose.yaml'), final_state
                assert final_state['caddy_config'] == str(old_release / 'compose.yaml'), final_state
                assert (deploy / 'previous.env').read_text() == previous_saved
            else:
                assert final_state == {}, final_state
            if mode in ('health-fail', 'tls-fail'):
                assert 'Previous deployment restored' in result.stderr, result.stderr
            if mode == 'first-fail':
                assert 'First deployment failed' in result.stderr, result.stderr
        assert (deploy / 'server.env').read_text() == 'ALLOWED_ORIGINS=https://example.com\n'
        assert not list(deploy.glob('.deploy.*')), 'temporary credential/state folder leaked'
        print(f'PASS: {mode} (previous={previous})')


if __name__ == '__main__':
    for executable in ('bash', 'jq'):
        if not shutil.which(executable):
            raise SystemExit(f'Required test command is unavailable: {executable}')
    for case in ('success', 'health-fail', 'tls-fail', 'pull-fail', 'locked'):
        run_case(case)
    run_case('success', previous=False)
    run_case('first-fail', previous=False)
