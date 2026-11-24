# Deploying Bill X-Ray

This runbook is for the person who puts the app online. It follows D-018: only the built
`dist/` folder is uploaded, directly to the company's Cloudflare account, at its default
address, with no custom domain and no paid feature. The site stays up until the award
announcement, 2027-02-04 KST.

**Agents never sign up, log in or upload.** Every step that needs a person is marked
**(person)**. Agents may prepare files and run the checks in step 1, nothing more.

Roles are named A and B, as in the rest of the repository. Write a role, never a personal
name, in any record of this work.

## What you need

- **(person)** Access to the company Cloudflare account, through the shared company
  mailbox. Nobody uses a personal account for this site.
- Node 22 and the repository checked out on `main`, with no uncommitted changes
  (`git status` prints nothing).
- Read access to the private research folder, which lies outside this repository. It holds
  the extra-patterns file that `check:dist` needs (step 1).
- A second person, who is not the one uploading, for step 5.

## 1. Run the checks that must all exit 0

Run these from the repository root, one at a time, in this order. Stop at the first
non-zero exit and fix the cause before going on. Do not upload anything while one fails.

```powershell
npm test
npm run validate:data
npm run check:copy
npm run check:repo
npm run build
npm run check:dist
```

Two of them need the private research folder, which is never inside the repository:

- `validate:data` skips its personal-name check unless it knows the folder. Set
  `$env:BILLXRAY_RESEARCH_DIR` to the folder before running it.
- `check:dist` must run with the extra-patterns file from that folder. Set
  `$env:BILLXRAY_DIST_PATTERNS` to the file before running it. The script refuses a file
  inside the repository. Without it the check is weaker: it cannot look for other
  outlets' sentences, personal names or retired brand names.

Clear both variables afterwards (`Remove-Item Env:BILLXRAY_DIST_PATTERNS`).

Then check three more things:

- `git check-ignore dist/index.html` prints a line. `dist/` stays out of git.
- The `dist/` folder holds `index.html` and an `assets/` folder, and no file ending in
  `.map`.
- Write down the commit you built from (`git log -1 --format=%H`) and the
  `index.html sha256` line that `check:dist` printed. Step 2 and step 5 use them.

**(person)** If any sample case carries promise data from the existing promise-tracking
service, confirm that the "Pre-existing work" section of the README says so before you go
on (D-019). If it does not, stop and tell the product owner. Do not edit the README
yourself.

## 2. (person) Internal sign-off

The product owner, or the person the company names, signs off in writing. Record it as a
**new line at the end of `docs/DECISIONS.md`**, in the same form as the lines above it:
the next free `D-` number, the date, `approved`, and one sentence saying what was
approved. Include the commit from step 1, the `index.html` hash from step 1 and the role
that ran the checks. Commit that line like any other change.

Do not upload before this line exists.

## 3. (person) Keep the last good build

Before each upload, copy the current `dist/` folder to a folder **outside the repository**,
named with the date and the commit. Keep every copy until the site comes down. The newest
copy that was live without problems is the one to restore if an upload goes wrong
(see "Rolling back").

## 4. (person) Upload only `dist/`

Use the company Cloudflare account and its default `workers.dev` address. Do not add a
custom domain, do not turn on any paid feature, and do not turn on logs, access rules or
other options that the account offers after the upload.

1. Open a terminal in an **empty folder outside the repository**. Wrangler, Cloudflare's
   command-line tool, may write files into the folder it runs in, and none of them belong
   in this repository.
2. Log in with the company account:

   ```powershell
   npx wrangler login
   ```

   This opens a browser. Sign in there. `npx` downloads Wrangler into its own cache, not
   into the repository.
3. Upload the built folder. Give the path to `dist/` and today's date:

   ```powershell
   npx wrangler deploy <path to the dist folder> --name bill-xray --compatibility-date <today, yyyy-mm-dd>
   ```

   Run it in an ordinary interactive terminal. Wrangler only accepts a folder path in
   interactive mode. If it asks to create files, change settings or add anything other
   than uploading this folder, answer no and ask the product owner.
4. Wrangler prints the live address, in the form
   `https://bill-xray.<account subdomain>.workers.dev`. Copy it into the sign-off record
   (step 8).
5. Log out so the session is not left open:

   ```powershell
   npx wrangler logout
   ```

Never use the `--temporary` option. It makes a throw-away account that is meant for
agents, and the site would not be in the company account.

## 5. (person, a different person) Check the live page for analytics

Do this right after every upload, and every time the site is uploaded again. The person
who uploaded does not do it.

1. Fetch the live HTML and search it:

   ```powershell
   $html = (Invoke-WebRequest -Uri "<live address>" -Headers @{ Accept = "text/html" }).Content
   $html -match "beacon.min.js"
   $html -match "cloudflareinsights"
   ```

   Both lines must print `False`. If the fetch returns error 1010, Cloudflare has refused
   a default automated client before the site ran. Add a descriptive `User-Agent` header
   to the same command and fetch again. Never turn any Cloudflare check off.
2. If either prints `True`, Cloudflare Web Analytics is adding a script. In the Cloudflare
   dashboard open **Web Analytics**, choose **Manage site** for this site, and set the
   automatic setup to **Disable**. Wait a few minutes.
3. Fetch again with the same commands. Both lines must now print `False`.
4. If a script is still there, or the site does not appear under Web Analytics, stop. Do
   not give the address to anyone, tell the product owner, and, if the site is already
   public, take it down as described under "Keeping the site up" until it is fixed.
5. Optional but useful: compute the SHA-256 of the live page (`$html`) and of
   `dist/index.html`. They should normally match. If they differ, find out why before
   going on.

Write the result and the role of the person who checked in the sign-off record.

## 6. (person) Look at the live site

In a private browser window, with the browser's developer tools open on the **Network**
tab:

- The only host you see is the live address. A request to any other host is a failure.
  Opening a source link yourself is the one exception, and that request goes from the
  source page, not from this site.
- At a 360 px wide window and at desktop width, the scan screen shows the same content and
  works.
- There is no login, no password and no sign-up prompt.
- A case whose evidence is missing or whose date is wrong shows "Not verified" or the
  matching unverified state, never a confirmed link or "in effect".

## 7. Keeping the site up

The site stays up until **2027-02-04 KST**. Fill in these two lines in the sign-off record
before the first upload:

- Opens the live address once a week and checks that it loads: ______ (role A or B)
- Can take the site down, and has the company Cloudflare access to do it: ______ (role A
  or B)

A personal name may go only into a record the company keeps outside this repository.

To take the site down, **(person)** open the company Cloudflare dashboard, go to
**Workers & Pages**, select the Worker, open **Settings**, then **Domains & Routes**, and
disable the `workers.dev` address. This can be undone by enabling it again. Do not delete
the Worker before 2027-02-04 KST unless the product owner says so.

## Rolling back

To go back to the last good build, **(person)** upload the saved copy from step 3 the same
way as in step 4, then repeat step 5 and step 6. The Cloudflare dashboard also keeps
earlier versions of the Worker under **Deployments**, where a rollback can be chosen
directly. Check the result with step 5 and step 6 either way.

## 8. Sign-off record

Keep one record per upload, as lines added to `docs/DECISIONS.md` or in a note the company
keeps outside the repository. Each record has:

- Date and time (KST) of the upload.
- Commit and `index.html` hash from step 1.
- Role that ran the checks in step 1, and role that uploaded.
- Live address.
- Step 5 result and the role of the person who checked.
- Step 6 result and the role of the person who checked.
- Where the saved copy from step 3 is kept.

Never put an account name, an email address, a key or a computer path in this record. In a
record kept in this repository, never put a personal name either.
