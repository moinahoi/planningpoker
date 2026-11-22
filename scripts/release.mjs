// Bumps root, server and client to one version, commits and tags it.
// Usage: npm run release -- 1.2.0   then: git push --follow-tags
import { execFileSync } from 'node:child_process'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run release -- <major.minor.patch>')
  process.exit(1)
}

const run = (cmd, args, cwd = '.') =>
  execFileSync(cmd, args, { cwd, stdio: ['inherit', 'pipe', 'inherit'] }).toString().trim()

if (run('git', ['status', '--porcelain'])) {
  console.error('Working tree is not clean. Commit or stash first.')
  process.exit(1)
}
if (run('git', ['tag', '-l', `v${version}`])) {
  console.error(`Tag v${version} already exists.`)
  process.exit(1)
}

for (const dir of ['.', 'server', 'client']) {
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], dir)
}
run('git', ['commit', '-am', `release: v${version}`])
run('git', ['tag', '-a', `v${version}`, '-m', `Planning Poker v${version}`])

console.log(`Tagged v${version}. Publish with: git push --follow-tags`)
