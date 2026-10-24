# Gyms

## Where we are going

Gyms, and every other run of the desktop app that an agent drives, never appear
in front of the person at the Mac. In the user's words: "you keep when running
gyms showing them in my face - you need to find a way"; gyms "must run with
window there - but like hidden somehow? and not interactive for me".

A gym runs with a real window, with real rendering, layout, compositing,
screenshots and video, that is hidden and non-interactive for the person: never
visible, never focused, never in the Dock, Cmd-Tab or Mission Control, and
impossible to click by accident. This is the default and cannot be gotten wrong.

Every gym and stability suite runs at more than one depth, chosen by a flag on
the same tests rather than by separate tests. In the user's words: stability
tests should "have varying levels of detail for runs"; for "most of releases -
preview we want to run the cheaper ones and the releases - fuller one", "likely
just a difference in flags", and "we should generally structure gym tests like
that". A preview runs the cheap depth. A production release runs the full one.

## How we get there

Every gym and agent-driven launch goes through the one Gym launcher, which
starts the app with hidden windows. The app itself refuses to show or focus a
window in that mode and fails loudly if one becomes visible. Recordings use the
launcher's own video capture. Nothing uses `open`, osascript, or desktop
capture.

Each gym and stability suite reads one depth flag, cheap or full. Preview
release validation passes the cheap depth and production release validation
passes the full one.

## How we know it is done

A gym run on the person's Mac leaves no window on screen and changes no focus,
proven from the window server's own window list, while its frames, layout,
input, screenshots and video still work.

A preview release runs every gym and stability suite at the cheap depth and a
production release runs them at the full depth, with the depth decided by one
flag and no test duplicated between the two.
