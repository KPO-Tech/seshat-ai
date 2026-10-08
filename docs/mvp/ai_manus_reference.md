# AI-Manus Reference Rule

AI-Manus is a UI/UX reference, not a codebase to port.

## Mental Model

Keep Seshat as the functional foundation.

Use AI-Manus as a donor for:

- layout ideas
- tool presentation
- interaction rhythm
- panel organization
- visual density
- animation choices
- workspace feel

Do not copy:

- Vue architecture
- backend assumptions
- state model
- routing model
- permission model
- product identity

## Component Decision

For each component, choose one of three paths:

1. Seshat is better:
   - keep logic and structure
   - migrate styling to Tailwind

2. AI-Manus is better visually:
   - keep Seshat logic
   - rebuild presentation in React/Tailwind

3. Both have strengths:
   - keep Seshat logic
   - use AI-Manus interaction pattern
   - express final UI in Seshat design language

## Permanent Rule

AI-Manus should help start the new UI generation.

It should not remain the permanent design authority.

Once Chat is DONE, Chat becomes the official Seshat visual reference for the
next MVP surfaces.

