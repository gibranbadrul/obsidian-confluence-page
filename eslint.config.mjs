import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
    {
        ignores: [
            '.idea/**',
            '.obsidian/**',
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

            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/no-deprecated': 'warn',

            'eslint-comments/no-unlimited-disable': 'off',
            'eslint-comments/require-description': 'off',
            'eslint-comments/disable-enable-pair': 'off',
            'eslint-comments/no-restricted-disable': 'off',

            'obsidianmd/rule-custom-message': 'off',
            'obsidianmd/no-nodejs-modules': 'off',
            'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
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
                        '^confluence_.*',
                        '^\\.obsidian.*'
                    ]
                }
            ],
        },
    },
];