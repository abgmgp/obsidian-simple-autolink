/**
 * Autocomplete suggester for the masterlist path field. Touches Obsidian APIs.
 *
 * Suggests existing markdown files whose path contains the typed query, while
 * still allowing the user to type a path that does not exist yet (so they can
 * point at a file they are about to create). Selection just fills the input.
 */

import { AbstractInputSuggest, App, TFile } from "obsidian";

export class MarkdownFileSuggest extends AbstractInputSuggest<TFile> {
  private readonly inputEl: HTMLInputElement;
  private readonly onPick: (path: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onPick: (path: string) => void) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.onPick = onPick;
  }

  getSuggestions(query: string): TFile[] {
    const q = query.trim().toLowerCase();
    const files = this.app.vault.getMarkdownFiles();
    const matches = q === "" ? files : files.filter((f) => f.path.toLowerCase().includes(q));
    return matches.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 50);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.inputEl.trigger("input");
    this.onPick(file.path);
    this.close();
  }
}
