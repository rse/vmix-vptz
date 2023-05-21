
<img src="https://raw.githubusercontent.com/rse/vmix-vptz/master/res/app-icon.svg" width="200" align="right" alt=""/>

vMix-VPTZ
=========

**vMix Virtual PTZ**

About
-----

**vMix-VPTZ** is a client/server applications for the control
of the virtual pan/tilt/zoom (PTZ) settings of *VirtualSet*'s in the
video mixing application [vMix](https://www.vmix.com/).

The application, written in [TypeScript](https://www.typescriptlang.org/),
consists of a central [Node.js](https://nodejs.org)-based server component and
a HTML5 Single-Page Application (SPA) as the client component.
The client component it turn runs in two distinct modes: a
[Vue.js](https://vuejs.org/) based control mode for real-time adjusting
the VPTZ parameters and a preview mode for real-time showing the
virtual PTZ areas on a physical camera.

Features
--------

- track individual VPTZ per PTZ on every VPTZ change
- track program and preview for active VPTZ
- switch to individual VPTZ on every PTZ change and once on vMix startup
- VPTZ drive from VPTZ A (preview) to B (program) via CUT+DRIVE: t = vptz(A), vptz(A, vptz(B)), cut(A), drive(A, t)
- VPTZ drive from VPTZ A (preview) to B (program) via DRIVE:     drive(B, vptz(A))

Usage (Production)
------------------

- Under Windows/macOS/Linux install [Node.js](https://nodejs.org)
  for the server run-time, [Google Chrome](https://www.google.com/chrome)
  for the client run-time, and [vMix](https://www.vmix.com) for the target application.

- Install all dependencies:<br/>
  `npm install --production`

- Run the production build-process once:<br/>
  `npm start build`

- Run the bare server component:<br/>
  `npm start server`

- Open the client component (control mode) in Google Chrome:<br/>
  https://127.0.0.1:12345/

- Use the client component (preview mode) in Google Chrome:<br/>
  https://127.0.0.1:12345/#/preview

Usage (Development)
-------------------

- Under Windows/macOS/Linux install [Node.js](https://nodejs.org)
  for the server run-time and [Google Chrome](https://www.google.com/chrome)
  for the client run-time,
  plus [Visual Studio Code](https://code.visualstudio.com/) with its
  TypeScript, ESLint and VueJS extensions.

- Install all dependencies:<br/>
  `npm install`

- Run the development build-process once:<br/>
  `npm start build-dev`

- Run the development build-process and server component continuously:<br/>
  `npm start dev`

- Open the client component (control mode) in Google Chrome:<br/>
  https://127.0.0.1:12345/

- Open the client component (preview mode) in Google Chrome:<br/>
  https://127.0.0.1:12345/#/preview

See Also
--------

- [TypeScript](https://www.typescriptlang.org/)
- [Vue.js](https://vuejs.org/)
- [Node.js](https://nodejs.org)
- [vMix](https://www.vmix.com)

Copyright & License
-------------------

Copyright &copy; 2023 [Dr. Ralf S. Engelschall](mailto:rse@engelschall.com)<br/>
Licensed under [GPL 3.0](https://spdx.org/licenses/GPL-3.0-only)

