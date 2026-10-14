# Beginner guide: your first hour

You run games. You have never written a line of code. This guide gets you from opening the Academy to your first working macro without assuming anything.

## What a macro is, in one paragraph

Foundry lets you store a short piece of JavaScript as a **macro** and run it from the hotbar. A macro can post a message, roll dice, read a creature's hit points, or change them. Writing one means telling the computer exactly what to do, one small step at a time. The Academy teaches you how to think in those steps.

## Step 1: open the Academy

Click the graduation-cap icon in the token controls on the left of the map, or press **Alt + Shift + A**. The dashboard appears. Press **Start** (or **Resume** if you have been here before).

## Step 2: read the first lesson

Lessons always have the same parts, in the same order. Read the **plain explanation** and the **analogy** first; skip the **technical** part if it looks dense (in Guided mode it is folded away). Then look at the **examples**: every example has a *Run* button that opens the workshop with the code already in it.

## Step 3: run an example

Press *Run*. The code runs in the **Concept Sandbox**: a sealed box that cannot touch your game. The result appears underneath. Change a word, run it again, see what changes. Breaking things here is free and is the fastest way to learn.

## Step 4: try an exercise

Scroll to the exercises. The first ones are questions: predict what a line prints, pick the correct option, fill in a blank. The checker tells you immediately whether you were right and why. If you get stuck on a code exercise:

1. Press **Hint**. There are five, each more specific than the last. Hints cost nothing.
2. If you are still stuck, press **Reveal solution**. It shows the answer in steps with explanations. The exercise is then marked *assisted*; you can come back later and do it on your own to earn an independent pass.

## Step 5: pass the checkpoint

A short quiz at the end of each lesson. Wrong answers explain the right ones. Passing it (together with the required exercises) completes the lesson and unlocks the next.

## The three boxes

The workshop can run code in three places. Knowing which one you are in is the single most important safety habit.

- **Concept Sandbox**: plain JavaScript. Nothing from Foundry exists here. Safe.
- **Foundry Preview**: a pretend Foundry with practice creatures (Sir Reginald, Mirabel, some goblins, an orc, a wolf). Your code sees things that look exactly like real actors and tokens, and every change it would make is *recorded and shown* instead of being made. Safe.
- **Live**: your real world. A warning appears before every live run and asks you to confirm. Only use it after a preview run did what you expected.

The header of the workshop always names the box you are in.

## Practice creatures in your real world

When you reach Tier 3 you will want real tokens to click on. Ask your GM (or yourself, if you are the GM) to open **Diagnostics** and press **Create practice fixtures**. The Academy makes a folder of practice actors and a practice scene, all labelled as Academy fixtures. **Reset** puts them back the way they were; **Clean up** removes them. Nothing else in the world is touched.

## When an error appears

Errors are not failures; they are messages. The lesson *Reading error messages* (Tier 0) teaches how to read them, and the **Debugging** view has an **error explainer**: paste the message and it tells you the likely cause and which lesson covers it. If it does not recognise the message it says so instead of guessing.

## How long does it take?

The whole curriculum is about 44 hours of lessons and practice. Tier 0 and Tier 1 together are around six hours and end with a small combat helper you wrote yourself. Most people do a lesson or two per session. Your progress is saved after every click, so stop whenever you like.

## Three habits that make everything easier

1. **Run every example.** Reading code is not the same as running it.
2. **Change the examples.** Replace a name, a number, a condition. Predict what will happen before you run it.
3. **Say the error out loud.** "hp is undefined because the token has no actor" is a sentence you can fix. "It's broken" is not.
