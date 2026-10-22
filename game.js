// State is independent of map geometry and the DOM.
export class Game {
  constructor(countries, includeMicrostates = true, random = Math.random) {
    this.countries = countries.filter(country => includeMicrostates || !country.microstate);
    if (!this.countries.length) throw new Error('No playable countries');
    this.queue = [...this.countries];
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.ids = new Set(this.countries.map(country => country.code));
    this.completed = new Map();
    this.correct = 0;
    this.incorrect = 0;
    this.reveals = 0;
  }
  get current() { return this.queue[this.completed.size] ?? null; }
  get total() { return this.countries.length; }
  get done() { return this.completed.size === this.total; }
  guess(code) {
    if (this.done || !this.ids.has(code)) return 'ignored';
    if (code !== this.current.code) {
      this.incorrect++;
      return 'incorrect';
    }
    this.completed.set(code, 'correct');
    this.correct++;
    return 'correct';
  }
  reveal() {
    if (this.done) return null;
    const code = this.current.code;
    this.completed.set(code, 'revealed');
    this.reveals++;
    return code;
  }
  revealAll() {
    const codes = [];
    while (!this.done) codes.push(this.reveal());
    return codes;
  }
}
