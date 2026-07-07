import { readFile, writeFile } from 'node:fs/promises';

const packageJson = await readJson('package.json');
const manifest = await readJson('manifest.json');
const shouldUpdateVersionsJson = process.env.UPDATE_VERSIONS_JSON === 'true';

const version = String(process.argv[2] || process.env.npm_package_version || packageJson.version)
	.replace(/^v/, '')
	.trim();

if (!version) {
	throw new Error('version is required');
}

packageJson.version = version;
manifest.version = version;

await writeJson('package.json', packageJson);
await writeJson('manifest.json', manifest);

if (shouldUpdateVersionsJson) {
	if (!manifest.minAppVersion) {
		throw new Error('manifest.json minAppVersion is required');
	}

	const versions = await readJson('versions.json');

	versions[version] = manifest.minAppVersion;

	await writeJson('versions.json', versions);
}

console.log(
	shouldUpdateVersionsJson
		? `Updated package.json, manifest.json, and versions.json to ${version}`
		: `Updated package.json and manifest.json to ${version}`,
);

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
	await writeFile(filePath, JSON.stringify(value, null, '\t') + '\n');
}
