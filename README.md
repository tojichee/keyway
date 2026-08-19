# Keyway

Matches client and seller availability to schedule property viewings,
with automatic next-day fallback and WhatsApp confirmations. Runs
entirely in the browser — no backend, no account.

## Data storage
Uses localStorage. Data stays on whichever device/browser this is opened
in — no sync between phone and laptop. If that becomes a problem later,
the fix is swapping localStorage for a real backend (Firebase/Supabase),
which is a bigger step with its own setup.

## Running it locally
    npm install
    npm run dev

## Deploying it live (get a real URL)
Easiest path — Vercel, free, no command line needed:
1. Go to vercel.com, sign up (GitHub login is fastest)
2. Click "Add New Project"
3. Drag this whole folder onto the upload area (or connect a GitHub repo
   if you push this folder there first)
4. Vercel auto-detects Vite — just click Deploy
5. You'll get a URL like keyway-xyz.vercel.app — that's the
   real, live link. Bookmark it on mom's phone home screen and it opens
   like an app.

Netlify works the same way (drag-and-drop deploy at netlify.com/drop) if
you'd rather use that instead.
