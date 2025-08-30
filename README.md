# Timestamp Ordering Protocol Checker

**Course:** Advanced Databases

**University:** Malek Ashtar University of Technology

**Instructor:** Dr. Shahab Behjati

**Students:**
- Mohammd Mehdi Rahimi  `https://github.com/MohammadMehdiRahimi` 
- Ali Yousefi
- Sajad CheraghAli
- Sara BahramiBehzad
- Maryam Hamedi 


---

## Overview

This project is an interactive educational tool implemented with **React** and **Tailwind CSS** to demonstrate and check the **Timestamp Ordering Protocol** (a concurrency control protocol) for the Advanced Databases course. It allows users to build a schedule (sequence) of operations (`read`, `write`, `commit`) performed by transactions on data items and then simulates the timestamp-ordering rules to determine whether the schedule is valid under the protocol.

## Purpose

The tool was created for the Advanced Databases course at Malek Ashtar University of Technology and is intended to help students and instructors visualize how timestamp-based concurrency control works, observe conflicts, and learn how Thomas' Write Rule affects behavior.

## Features

- Add / edit / delete operations: `read`, `write`, `commit`.
- Automatic transaction identifiers in the form `T<number>` (entering `1` becomes `T1`).
- Optional Thomas' Write Rule toggle (ignore older writes instead of aborting).
- Per-operation decision log showing outcomes: `ok`, `ignored`, `aborted`, `commit` and explanatory messages.
- Displays each data item's `RTS` and `WTS` and each transaction's `TS`.
- Final verdict indicating whether the schedule is valid (no aborts) or invalid (one or more aborts).
- Graphical timeline view: columns = operations order, rows = transactions; colored markers show each operation's result and the reason on hover.
- RTL UI styling for Persian layout (can be adjusted easily).

## How the simulation works (brief)

- Transactions are assigned timestamps in the order of their first appearance in the schedule.
- **Read(X) by T:** if `TS(T) < WTS(X)` then T aborts; otherwise `RTS(X) = max(RTS(X), TS(T))` and the read succeeds.
- **Write(X) by T:** if `TS(T) < RTS(X)` then T aborts. Else if `TS(T) < WTS(X)` then either abort (classical rule) or ignore (Thomas' Write Rule) depending on the toggle. If allowed, the write sets `WTS(X) = TS(T)`.
- `commit` entries record a commit attempt; if the transaction was previously aborted, commit will indicate that.

## Quick start (development)

Requirements: Node.js (v14+) and npm or yarn.

1. Clone the repository:

```bash
git clone https://github.com/MohammadMehdiRahimi/timestamp-protocol.git
cd timestamp-scheduler
```

2. Install dependencies:

```bash
npm install
# or
# yarn install
```

3. Start the development server:

```bash
npm run dev
# or
# npm start
```

4. Open the app at `http://localhost:3000` (or the port shown by your dev server).

> If Tailwind CSS is not yet configured in your environment, follow Tailwind's official setup guide for your chosen React toolchain (Create React App, Vite, Next.js, etc.).

## Usage

1. Choose operation type (`Read`, `Write`, `Commit`).
2. Enter the transaction number (e.g. `1`) — the UI will automatically use `T1`.
3. For `Read`/`Write`, enter the data item (e.g. `A`). For `Commit`, the item field is disabled.
4. Click **Add Operation** to append it to the schedule; repeat to build the full schedule in the desired order.
5. Click **Run Simulation** to execute the timestamp-ordering rules and view the log, RTS/WTS values, transaction timestamps, and the graphical timeline.

## Teaching tips

- Create small schedules to test individual rules (e.g. read-after-later-write to see aborts).
- Toggle Thomas' Write Rule to observe how older writes are ignored instead of aborting.
- Use the timeline to visually trace which operations caused conflicts.

## License

This project is released under the MIT License. See the LICENSE file.
---

## Live demo


The project is deployed and available online at:


https://timestamp-protocol.vercel.app/