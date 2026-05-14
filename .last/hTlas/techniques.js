// Custom Counter Component
class CustomCounter extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .counter {
                    font-size: 2rem;
                    font-weight: bold;
                    color: #3498db;
                    display: inline-block;
                    padding: 1rem;
                    border: 2px solid #3498db;
                    border-radius: 5px;
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

customElements.define('custom-counter', CustomCounter);

// Service Worker Cache Check
document.getElementById('check-cache').addEventListener('click', async () => {
    const statusEl = document.getElementById('cache-status');
    try {
        const cacheNames = await caches.keys();
        statusEl.textContent = `Aktif cache'ler: ${cacheNames.join(', ')}`;
    } catch (error) {
        statusEl.textContent = 'Cache kontrol edilemedi: ' + error.message;
    }
});

// PWA Install Prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-btn').style.display = 'block';
    document.getElementById('install-status').textContent = 'Uygulama yüklenebilir durumda!';
});

document.getElementById('install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        document.getElementById('install-status').textContent = 
            outcome === 'accepted' ? 'Uygulama yüklendi!' : 'Yükleme iptal edildi';
        deferredPrompt = null;
    }
});

// WebGL Demo - Simple Cube
const canvas = document.getElementById('webgl-demo');
const gl = canvas.getContext('webgl');

if (gl) {
    // Vertex shader
    const vertexShaderSource = `
        attribute vec3 a_position;
        uniform mat4 u_matrix;
        void main() {
            gl_Position = u_matrix * vec4(a_position, 1.0);
        }
    `;

    // Fragment shader
    const fragmentShaderSource = `
        precision mediump float;
        void main() {
            gl_FragColor = vec4(0.5, 0.7, 1.0, 1.0);
        }
    `;

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Cube vertices
    const positions = new Float32Array([
        // Front face
        -0.5, -0.5,  0.5,
         0.5, -0.5,  0.5,
         0.5,  0.5,  0.5,
        -0.5,  0.5,  0.5,
        // Back face
        -0.5, -0.5, -0.5,
        -0.5,  0.5, -0.5,
         0.5,  0.5, -0.5,
         0.5, -0.5, -0.5,
        // Top face
        -0.5,  0.5, -0.5,
        -0.5,  0.5,  0.5,
         0.5,  0.5,  0.5,
         0.5,  0.5, -0.5,
        // Bottom face
        -0.5, -0.5, -0.5,
         0.5, -0.5, -0.5,
         0.5, -0.5,  0.5,
        -0.5, -0.5,  0.5,
        // Right face
         0.5, -0.5, -0.5,
         0.5,  0.5, -0.5,
         0.5,  0.5,  0.5,
         0.5, -0.5,  0.5,
        // Left face
        -0.5, -0.5, -0.5,
        -0.5, -0.5,  0.5,
        -0.5,  0.5,  0.5,
        -0.5,  0.5, -0.5,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0);

    const matrixLocation = gl.getUniformLocation(program, 'u_matrix');

    function drawScene(time) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        const matrix = mat4.create();
        mat4.perspective(matrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
        mat4.translate(matrix, matrix, [0, 0, -3]);
        mat4.rotateX(matrix, matrix, time * 0.001);
        mat4.rotateY(matrix, matrix, time * 0.001);

        gl.uniformMatrix4fv(matrixLocation, false, matrix);
        gl.drawArrays(gl.TRIANGLES, 0, 36);

        requestAnimationFrame(drawScene);
    }

    // Simple mat4 implementation for demo
    const mat4 = {
        create: () => new Float32Array(16),
        perspective: (out, fovy, aspect, near, far) => {
            const f = 1.0 / Math.tan(fovy / 2);
            out[0] = f / aspect;
            out[1] = 0;
            out[2] = 0;
            out[3] = 0;
            out[4] = 0;
            out[5] = f;
            out[6] = 0;
            out[7] = 0;
            out[8] = 0;
            out[9] = 0;
            out[10] = (far + near) / (near - far);
            out[11] = -1;
            out[12] = 0;
            out[13] = 0;
            out[14] = (2 * far * near) / (near - far);
            out[15] = 0;
        },
        translate: (out, a, v) => {
            const x = v[0], y = v[1], z = v[2];
            out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
            out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
            out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
            out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
        },
        rotateX: (out, a, rad) => {
            const s = Math.sin(rad), c = Math.cos(rad);
            out[4] = a[4] * c + a[8] * s;
            out[5] = a[5] * c + a[9] * s;
            out[6] = a[6] * c + a[10] * s;
            out[7] = a[7] * c + a[11] * s;
            out[8] = a[8] * c - a[4] * s;
            out[9] = a[9] * c - a[5] * s;
            out[10] = a[10] * c - a[6] * s;
            out[11] = a[11] * c - a[7] * s;
        },
        rotateY: (out, a, rad) => {
            const s = Math.sin(rad), c = Math.cos(rad);
            out[0] = a[0] * c - a[8] * s;
            out[1] = a[1] * c - a[9] * s;
            out[2] = a[2] * c - a[10] * s;
            out[3] = a[3] * c - a[11] * s;
            out[8] = a[0] * s + a[8] * c;
            out[9] = a[1] * s + a[9] * c;
            out[10] = a[2] * s + a[10] * c;
            out[11] = a[3] * s + a[11] * c;
        }
    };

    requestAnimationFrame(drawScene);
}

// Validation Form Demo
document.getElementById('validation-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) {
        form.reportValidity();
    } else {
        alert('Form başarıyla doğrulandı!');
    }
});

// CORS Image Demo
document.getElementById('load-cors-image').addEventListener('click', () => {
    const img = document.getElementById('cors-image');
    // Using a CORS-enabled image from a public API
    img.src = 'https://picsum.photos/200/200?random=1';
    img.crossOrigin = 'anonymous';
});

// Data Attributes Demo
let count = 0;
const dataDemo = document.getElementById('data-demo');

document.getElementById('increment-data').addEventListener('click', () => {
    count++;
    dataDemo.dataset.count = count;
    dataDemo.textContent = `Tıkla: ${count}`;
});

document.getElementById('change-color').addEventListener('click', () => {
    const colors = ['blue', 'red', 'green', 'purple'];
    const currentColor = dataDemo.dataset.color;
    const nextColor = colors[(colors.indexOf(currentColor) + 1) % colors.length];
    dataDemo.dataset.color = nextColor;
    dataDemo.style.color = nextColor;
});

// Intersection Observer Demo
const animatedBoxes = document.querySelectorAll('.animated-box');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateX(0)';
        }
    });
}, { threshold: 0.5 });

animatedBoxes.forEach(box => {
    box.style.opacity = '0';
    box.style.transform = 'translateX(-100px)';
    box.style.transition = 'opacity 0.5s, transform 0.5s';
    observer.observe(box);
});