# cero-ts Documentation

Build business logic that's powerful, predictable, and maintainable.

## Overview

cero-ts is a TypeScript framework for building maintainable, observable business logic through composable command objects. It brings structure, consistency, and powerful developer tools to your business processes.

Inspired by the [CMDx Ruby framework](https://github.com/drexed/cmdx), cero-ts embraces the **CERO pattern** (Compose, Execute, React, Observe) for clean, composable business logic.

## Documentation

### Getting Started

- [Getting Started](getting-started.md) - Installation, requirements, and the CERO pattern

### Core Concepts

- **Basics**
  - [Context](basics/context.md) - State management during execution
  - [Chain](basics/chain.md) - Execution chains and correlation IDs
  - [Execution](basics/execution.md) - Running tasks and workflows

- **Attributes**
  - [Definitions](attributes/definitions.md) - Required and optional attributes
  - [Coercions](attributes/coercions.md) - Automatic type conversion
  - [Validations](attributes/validations.md) - Input validation rules
  - [Defaults](attributes/defaults.md) - Default values

- **Interruptions**
  - [Halt](interruptions/halt.md) - Stopping execution with skip/fail
  - [Faults](interruptions/faults.md) - Exception handling with faults

- **Outcomes**
  - [Result](outcomes/result.md) - The Result object
  - [States](outcomes/states.md) - Complete vs interrupted
  - [Statuses](outcomes/statuses.md) - Success, skipped, failed

### Features

- [Callbacks](callbacks.md) - Lifecycle hooks
- [Middlewares](middlewares.md) - Cross-cutting concerns
- [Workflows](workflows.md) - Task composition
- [Logging](logging.md) - Structured observability
- [Configuration](configuration.md) - Global settings

## Quick Links

- [GitHub Repository](https://github.com/your-org/cero-ts)
- [npm Package](https://www.npmjs.com/package/cero-ts)
- [Examples](../examples/)

## License

LGPL-3.0
