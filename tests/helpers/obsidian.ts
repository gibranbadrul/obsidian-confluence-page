export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
		this.extension = this.name.includes('.') ? this.name.split('.').pop()! : '';
		this.basename = this.name.replace(new RegExp(`\\.${this.extension}$`), '');
	}
}

export class TFolder {
	path: string;
	name: string;
	children: Array<TFile | TFolder> = [];

	constructor(path: string, children: Array<TFile | TFolder> = []) {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
		this.children = children;
	}
}

export class Notice {
	constructor(public message: string) {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class Menu {}
export class Editor {}
export class MarkdownView {}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export async function requestUrl(): Promise<never> {
	throw new Error('requestUrl mock was not configured for this test');
}
