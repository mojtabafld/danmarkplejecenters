"""Create only this application's local database/config. Never print secrets."""
import grp
import os
from pathlib import Path
import secrets
import subprocess


def sql(query, database='postgres'):
    return subprocess.run(
        ['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
         '-d', database, '-tA'], input=query, check=True, capture_output=True, text=True,
    ).stdout.strip()


def configure():
    path = Path('/etc/plejefinder/app.env')
    if path.exists():
        existing = path.read_text()
        if '127.0.0.1:5432/plejefinder?sslmode=disable' not in existing:
            raise RuntimeError('Existing environment does not target the local application database')
    else:
        if sql("SELECT 1 FROM pg_roles WHERE rolname='plejefinder'"):
            raise RuntimeError('Application role already exists without its configuration; refusing password reset')
        password = secrets.token_hex(32)
        sql(f"CREATE ROLE plejefinder LOGIN PASSWORD '{password}'")
        sql('CREATE DATABASE plejefinder OWNER plejefinder')
        existing = '\n'.join([
            'HOST=127.0.0.1', 'PORT=8080',
            'PUBLIC_URL=https://plejefinder.online', 'FORCE_SECURE_COOKIES=1',
            f'DATABASE_URL=postgres://plejefinder:{password}@127.0.0.1:5432/plejefinder?sslmode=disable',
            'ADMIN_EMAILS=mojtaba.devops@gmail.com',
            'TRAFFIC_HASH_SECRET=' + secrets.token_hex(32),
            'PGOPTIONS="-c statement_timeout=15000 -c work_mem=2MB"',
        ]) + '\n'
    public_url = os.environ.get('ORACLE_PUBLIC_URL', 'https://plejefinder.online')
    if public_url not in ['https://oracle.plejefinder.online', 'https://plejefinder.online']:
        raise RuntimeError('Unexpected application public URL')
    existing = '\n'.join(line for line in existing.splitlines()
                         if not line.startswith('PUBLIC_URL=')) + '\nPUBLIC_URL=' + public_url + '\n'
    mail = {key: os.environ.get('OCI_' + key, '') for key in ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']}
    mail['MAIL_FROM'] = os.environ.get('OCI_MAIL_FROM', '')
    if any(mail.values()) and not all(mail.values()):
        raise RuntimeError('Supply all four OCI mail settings, or leave all unset')
    if all(mail.values()):
        for value in mail.values():
            if any(c in value for c in '\r\n\0'):
                raise RuntimeError('Mail settings must be single-line values')
        def quote(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
        mail['SMTP_PORT'] = '465'
        existing = '\n'.join(line for line in existing.splitlines()
                             if line.split('=', 1)[0] not in mail) + '\n'
        existing += '\n'.join(key + '=' + quote(value) for key, value in mail.items()) + '\n'
    tmp = path.with_suffix('.tmp')
    tmp.write_text(existing)
    os.chmod(tmp, 0o640)
    os.chown(tmp, 0, grp.getgrnam('plejefinder').gr_gid)
    tmp.replace(path)
    print('Local database and application configuration ready; secret values omitted.')


if __name__ == '__main__':
    configure()
