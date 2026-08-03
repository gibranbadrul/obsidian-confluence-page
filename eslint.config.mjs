import js from '@eslint/js';
import json from '@eslint/json';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
    {
        ignores: [
            '.idea/**',
            `.obsidian/**`,
            'dist/**',
            'node_modules/**',
            'coverage/**',
            'fixture/**',
            'fixtures/**',
            'tests/**',
            '*.patch',
            '*.zip',
        ],
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
    },
    js.configs.recommended,
    ...obsidianmd.configs.recommended,
    {
        files: ['manifest.json'],
        plugins: { json },
        language: 'json/json',
        rules: {
            'no-irregular-whitespace': 'off',
            'obsidianmd/validate-manifest': 'error',
        },
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            'no-console': 'off',
            'no-undef': 'off',
            'no-unused-vars': 'off',

            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/consistent-type-imports': [
                'warn',
                {
                    prefer: 'type-imports',
                    fixStyle: 'inline-type-imports',
                },
            ],
            '@typescript-eslint/no-deprecated': 'warn',
            'obsidianmd/prefer-create-el': 'warn',
            'obsidianmd/ui/sentence-case': [
                'warn',
                {
                    mode: 'loose',
                    allowAutoFix: false,
                    brands: [
                        'Obsidian',
                        'Confluence',
                        'Atlassian',
                        'Kroki',
                        'Mermaid',
                        'PlantUML'
                    ],
                    acronyms: [
                        'API',
                        'URL',
                        'PAT',
                        'PNG',
                        'XHTML',
                        'HTML',
                        'JSON',
                        'PDF',
                        'MB'
                    ],
                    ignoreRegex: [
                        '^https?://.*',
                        '.*atlassian\\.net.*',
                        '.*plantuml\\.com.*',
                        '.*kroki\\.io.*',
                        '^confluence_.*'
                    ]
                }
            ],
        },
    },
];