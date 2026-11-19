# Task Timer

A pomodoro-style timer that keeps track of how long you work, by category,
with a writing challenge you can do alone or with your whole lab.

## What it does

**Timer.** Pick a category, set a duration, press Start. Each session is saved
when the timer ends, when you reset it, or when you close the page. Time is
never lost on a reload, a pause, or a crash.

**Stats.** A chart of each week by category, with arrows to look at earlier
weeks. Weekly goals. The list of your sessions, where you can delete one or
add time by hand when you forgot to start the timer. A CSV download.

**Lab.** The writing challenge. The goal is a number of minutes of writing a
day (30 by default, weekdays only). You see your week, your streak of days in
a row, and your totals. Once your lab is connected, everyone sees the same
table for the whole lab.

Only sessions in the **Writing** category count for the challenge, and only
those are shared with the lab. Everything else stays in your browser.

To see what the Lab page looks like with a full lab, open `#/lab?demo`.

## Run it

```bash
npm install
npm run dev
```

```bash
npm test
```

Without any setup the app works for one person, with everything stored in the
browser.

## Connect your lab (about ten minutes, once)

The lab's writing time lives in a free [Supabase](https://supabase.com)
database. One person sets it up; everyone else only needs the link to the app
and the lab code.

1. Create a free Supabase account and a new project.
2. In **Authentication, Sign In / Providers**, turn on **Allow anonymous
   sign-ins**. Lab members get an account tied to their browser: no email and
   no password.
3. Open the **SQL editor**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and before running it edit
   the last lines: the lab's name, the daily goal, whether weekends count, the
   start day, and your own **join code** in place of `change-this-code`.
4. In **Project Settings, API**, copy the project URL and the public key
   ("publishable" or "anon") into a file named `.env.local`, following
   [`.env.example`](.env.example). On Vercel, add the same two variables in
   the project's Environment Variables and redeploy.
5. Send the lab the link to the app and the join code. Each person opens the
   Lab page, types a first name and the code, and is in.

To change the rules later, edit the row in the `lab` table. To change the
code, edit the row in `lab_secret`.

### Who can see what

Members see each member's name and minutes of writing per day. Nobody outside
the lab can read anything: reading needs the join code. Each person can only
add, change or delete their own sessions. Leaving the lab (bottom of the Lab
page) removes that person's shared data for everyone.

### Good to know

A membership is tied to one browser. Someone who writes on two computers, or
who clears their browser data, joins again and appears as a second person.
The table starts counting on the lab's start day.

## How it is built

React and Vite. `src/challenge.js` holds the rules of the challenge (days,
goal, streaks) as plain functions, tested in `src/challenge.test.js`.
`src/labApi.js` is the only file that talks to Supabase, and is loaded only
when a lab is connected.
