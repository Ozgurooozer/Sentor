// Web Components: Custom Elements
class ThemeToggle extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                button {
                    background: none;
                    border: 1px solid white;
                    color: white;
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    border-radius: 5px;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: rgba(255,255,255,0.1);
                }
                :host([data-theme="dark"]) button {
                    border-color: #f4f4f4;
                    color: #f4f4f4;
                }
            </style>
            <button>Tema Değiştir</button>
        `;
        this.button = this.shadowRoot.querySelector('button');
        this.button.addEventListener('click', this.toggleTheme.bind(this));
    }

    toggleTheme() {
        const body = document.body;
        const newTheme = body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.setAttribute('data-theme', newTheme);
    }

    connectedCallback() {
        const currentTheme = localStorage.getItem('theme') || 'light';
        this.setAttribute('data-theme', currentTheme);
    }
}

class AnimatedCounter extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .counter {
                    font-size: 2rem;
                    font-weight: bold;
                    color: var(--primary-color, #3498db);
                    display: inline-block;
                    margin: 1rem;
                }
            </style>
            <div class="counter">0</div>
        `;
        this.counter = this.shadowRoot.querySelector('.counter');
        this.target = parseInt(this.getAttribute('target')) || 100;
        this.duration = parseInt(this.getAttribute('duration')) || 2000;
    }

    connectedCallback() {
        this.animateCounter();
    }

    animateCounter() {
        const start = performance.now();
        const animate = (timestamp) => {
            const elapsed = timestamp - start;
            const progress = Math.min(elapsed / this.duration, 1);
            const current = Math.floor(progress * this.target);
            this.counter.textContent = current;
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }
}

// Register custom elements
customElements.define('theme-toggle', ThemeToggle);
customElements.define('animated-counter', AnimatedCounter);