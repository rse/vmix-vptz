
<img src="https://raw.githubusercontent.com/rse/vmix-vptz/master/src/client/app-icon.svg" width="200" align="right" alt=""/>

vMix-VPTZ
=========

**vMix Virtual PTZ Management**

About
-----

**vMix-VPTZ** is a client/server applications for the external
management of the virtual pan/tilt/zoom (PTZ) settings of *VirtualSet*'s
in the video mixing application [vMix](https://www.vmix.com/). It has
the following four distinct features:

- **Reset/Switch VPTZ**: It allows you to reset the virtual PTZ set
  belonging to a physical PTZ once after vMix startup, and automatically
  switches to the individual virtual PTZ set belonging to a physical
  PTZ on every physical PTZ activation. For this, the physical PTZ
  activations have to be routed through **vMix-VPTZ**, which in turn
  activates the physical PTZ in vMix and updates all corresponding
  virtual PTZs.
  **Rationale:** This allows you to have (and activate) a true individual
  virtual PTZ per each physical PTZ.

- **Track Preview/Program**: It tracks the program and preview for
  active *VirtualSet* inputs to know which virtual PTZ(s) are currently
  in preview.
  **Rationale:** This allows **vMix-VPTZ** to know to which *VirtualSet*
  a virtual PTZ adjustments is applied to.

- **Track VPTZ per PTZ**: It tracks individual virtual PTZ settings of
  *VirtualSet* inputs per each physical PTZ of a camera input. This allows
  you to select a physical PTZ input of a camera and get a unique set of
  virtual PTZ settings in the corresponding *VirtualSet* inputs. For this,
  all virtual PTZ adjustments have to be routed through **vMix-VPTZ**, which
  records the virtual PTZ adjustments and routes them to vMix, too.
  **Rationale:** This allows you to have a true individual virtual PTZ
  per each physical PTZ.

- **Cutted Drive**: It allows you to VPTZ-drive from VPTZ A (in preview)
  to VPTZ B (in program) via a Cut and a subsequent Drive operation like `t
  = vptz(A), vptz(A, vptz(B)), cut(A), drive(A, t)`. In other words: it
  remembers the target virtual PTZ of A, sets A to the virtual PTZ of B, cuts A into
  program and then drives A to the remembered target virtual PTZ.
  **Rationale:** This allows the video mixing engineer to perform
  a (usually pre-configured or ad-hoc) live camera drive between to
  regular *VirtualSet* inputs.

- **Direct Drive**: It allows you to VPTZ-drive from VPTZ A (in preview)
  to B (in program) via a direct Drive operation like `drive(B, vptz(A))`.
  In other words: it drives B to the virtual PTZ of A without any Cuts.
  **Rationale:** This allows the video mixing engineer to perform
  an ad-hoc camera drive for a regular *VirtualSet* input
  based on a preview-only "scratch" *VirtualSet*.

The application, written in
[TypeScript](https://www.typescriptlang.org/), consists of a central
[Node.js](https://nodejs.org)-based server component and a HTML5
Single-Page Application (SPA) as the client component.

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

- Open the control client in Google Chrome:<br/>
  https://127.0.0.1:12345/

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

- Open the control client in Google Chrome:<br/>
  https://127.0.0.1:12345/

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

