// Unit tests of the source, and checks of what `npm run build` made
// (tests/build needs a build first: npm run test:build does both)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {test: {name: 'unit', include: ['tests/unit/**/*.test.js'], environment: 'node'}},
      {test: {name: 'build', include: ['tests/build/**/*.test.js'], environment: 'node'}},
    ],
  },
})
