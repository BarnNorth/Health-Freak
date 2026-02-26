module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^expo-image-manipulator$': '<rootDir>/services/__mocks__/expo-image-manipulator.ts',
    '^expo-file-system/legacy$': '<rootDir>/services/__mocks__/expo-file-system.ts',
    '^expo-file-system$': '<rootDir>/services/__mocks__/expo-file-system.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(expo-image-manipulator|expo-file-system)/)',
  ],
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
};
