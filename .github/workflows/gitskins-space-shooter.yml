name: Generate GitSkins Space Shooter

on:
  push:
    paths:
      - README.md
      - .github/workflows/gitskins-space-shooter.yml
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

concurrency:
  group: gitskins-space-shooter
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Check out profile repository
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Prepare output
        run: mkdir -p dist

      - name: Generate Space Shooter
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          python -m pip install --disable-pip-version-check "gh-space-shooter==2.0.4"
          gh-space-shooter asamassekou10 --output dist/space-shooter.gif --strategy random --fps 30

      - name: Publish generated game
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git ls-remote --exit-code origin refs/heads/output >/dev/null 2>&1; then
            git fetch origin output
            git worktree add /tmp/gitskins-output FETCH_HEAD
          else
            git worktree add --detach /tmp/gitskins-output
            cd /tmp/gitskins-output
            git checkout --orphan output
            git rm -rf . >/dev/null 2>&1 || true
            cd -
          fi
          cp -f dist/space-shooter.gif /tmp/gitskins-output/
          cd /tmp/gitskins-output
          git add space-shooter.gif
          git diff --cached --quiet || git commit -m "Update GitSkins Space Shooter"
          git push origin HEAD:output
