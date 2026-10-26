// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true })
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'holysheet-configure-'))
  directories.push(directory)
  await mkdir(join(directory, 'scripts'))
  await copyFile(
    new URL('../../scripts/configure-backend.mjs', import.meta.url),
    join(directory, 'scripts/configure-backend.mjs')
  )
  await writeFile(
    join(directory, 'transport.mjs'),
    `
import {writeFileSync} from 'node:fs';
globalThis.fetch = async (url, options) => {
 const values=Object.fromEntries(JSON.parse(options.body).changes.map(row=>[row.name,row.value]));
 writeFileSync(process.env.TEST_SUMMARY, JSON.stringify({target: String(url), sender:values.AUTH_EMAIL_FROM,passwordOnly:values.AUTH_PASSWORD_ONLY,hasSmtpPassword:values.SMTP_PASSWORD===process.env.SMTP_PASSWORD,hasAdminKeyInPayload:Object.hasOwn(values,'CONVEX_SELF_HOSTED_ADMIN_KEY')}));
 return new Response('',{status:Number(process.env.TEST_STATUS??200)});
};`
  )
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(CONVEX_|SMTP_|BETTER_AUTH_SECRET)/.test(name)
    )
  )
  const env = {
    ...environment,
    CONVEX_SELF_HOSTED_URL: 'http://backend:3210',
    CONVEX_SELF_HOSTED_ADMIN_KEY: 'synthetic-admin-key',
    VITE_SITE_URL: 'https://gmscreen.holysheet.fr',
    BETTER_AUTH_SECRET: 'synthetic-authentication-secret-32-characters',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '465',
    SMTP_SECURITY: 'tls',
    SMTP_USER: 'synthetic-user',
    SMTP_PASSWORD: 'synthetic-smtp-password',
    TEST_SUMMARY: join(directory, 'summary.json'),
  }
  return { directory, env }
}

function configure(
  release: Awaited<ReturnType<typeof fixture>>,
  extra: Record<string, string> = {},
  args: string[] = []
) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      join(release.directory, 'transport.mjs'),
      join(release.directory, 'scripts/configure-backend.mjs'),
      ...args,
    ],
    {
      cwd: release.directory,
      env: { ...release.env, ...extra },
      encoding: 'utf-8',
      timeout: 5000,
    }
  )
}

test('release configuration sends an explicit whitelist without printing credentials', async () => {
  const release = await fixture()
  const result = configure(release)
  expect(result.status).toBe(0)
  expect(JSON.parse(await readFile(release.env.TEST_SUMMARY, 'utf-8'))).toEqual(
    {
      target: 'http://backend:3210/api/update_environment_variables',
      sender: 'admin@holysheet.fr',
      passwordOnly: 'true',
      hasSmtpPassword: true,
      hasAdminKeyInPayload: false,
    }
  )
  expect(
    [
      release.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
      release.env.SMTP_PASSWORD,
      release.env.BETTER_AUTH_SECRET,
    ].some((value) => `${result.stdout}${result.stderr}`.includes(value))
  ).toBe(false)
})

test.each([
  { SMTP_PASSWORD: '' },
  { CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210' },
  { CONVEX_DEPLOY_KEY: 'synthetic-cloud-selector' },
  { SMTP_SECURITY: 'none' },
])(
  'release configuration refuses invalid or development targets',
  async (invalid) => {
    const release = await fixture()
    expect(configure(release, invalid).status).toBe(1)
    await expect(readFile(release.env.TEST_SUMMARY, 'utf-8')).rejects.toThrow()
  }
)

test('release configuration refuses a checkout containing local secrets and rejects arguments', async () => {
  const release = await fixture()
  expect(configure(release, {}, ['--force']).status).toBe(1)
  await writeFile(join(release.directory, '.env.local'), 'LOCAL_ONLY=true\n')
  expect(configure(release).status).toBe(1)
  await expect(readFile(release.env.TEST_SUMMARY, 'utf-8')).rejects.toThrow()
})
