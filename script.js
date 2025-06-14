document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    const canvas = document.getElementById('canvas');
    const connectionsSvg = document.getElementById('connections-svg');
    const wiringModalOverlay = document.getElementById('wiring-modal-overlay');

    // --- State Management ---
    let machineInstances = [];
    let nextId = 0;
    let isRunning = false;
    let wiringState = {}; // Holds info during a wire drag

    // --- OOP DEFINITIONS ---
    class MachineComponent {
        constructor(type, x, y) {
            this.id = nextId++;
            this.type = type;
            this.x = x;
            this.y = y;
            this.element = this.createDOMElement();
            this.connections = [];
        }

        createDOMElement() {
            const el = document.createElement('div');
            el.className = 'machine-component';
            el.style.left = `${this.x}px`;
            el.style.top = `${this.y}px`;
            el.dataset.id = this.id;

            el.innerHTML = `
                <div class="component-main">${this.getHTML()}</div>
                <div class="component-methods-list"></div>
                <div class="connection-point top" data-direction="top"></div>
                <div class="connection-point right" data-direction="right"></div>
                <div class="connection-point bottom" data-direction="bottom"></div>
                <div class="connection-point left" data-direction="left"></div>
            `;
            canvas.appendChild(el);

            const methodsListEl = el.querySelector('.component-methods-list');
            const methods = this.getMethods();
            if (Object.keys(methods).length > 0) {
                 for (const methodName in methods) {
                    const methodEl = document.createElement('div');
                    methodEl.className = 'component-method-label';
                    methodEl.textContent = `${methodName}()`;
                    methodsListEl.appendChild(methodEl);
                }
            } else {
                methodsListEl.style.display = 'none';
            }

            return el;
        }

        getHTML() { throw new Error("getHTML() must be implemented by subclass."); }
        getEvents() { return {}; }
        getMethods() { return {}; }
        updateVisuals() {}

        connectTo(targetComponent, eventName, methodName) {
            const connection = {
                targetId: targetComponent.id,
                event: eventName,
                method: methodName,
                line: document.createElementNS('http://www.w3.org/2000/svg', 'line'),
                label: document.createElementNS('http://www.w3.org/2000/svg', 'text')
            };

            connection.line.setAttribute('stroke', '#3498db');
            connection.line.setAttribute('stroke-width', '3');
            connection.line.setAttribute('stroke-dasharray', '5, 5');

            connection.label.setAttribute('class', 'wire-label');
            connection.label.textContent = `${methodName}()`;

            connectionsSvg.appendChild(connection.line);
            connectionsSvg.appendChild(connection.label);

            this.connections.push(connection);
            this.updateConnections();
        }

        updateConnections() {
            this.connections.forEach(conn => {
                const target = machineInstances.find(inst => inst.id === conn.targetId);
                if (target) {
                    const startCoords = this.getEdgeAttachPoint(target);
                    const endCoords = target.getEdgeAttachPoint(this);

                    conn.line.setAttribute('x1', startCoords.x);
                    conn.line.setAttribute('y1', startCoords.y);
                    conn.line.setAttribute('x2', endCoords.x);
                    conn.line.setAttribute('y2', endCoords.y);

                    const midX = (startCoords.x + endCoords.x) / 2;
                    const midY = (startCoords.y + endCoords.y) / 2 - 5;
                    conn.label.setAttribute('x', midX);
                    conn.label.setAttribute('y', midY);
                }
            });

            machineInstances.forEach(inst => {
                inst.connections.forEach(conn => {
                    if (conn.targetId === this.id) inst.updateConnections();
                });
            });
        }

        getEdgeAttachPoint(otherNode) {
            const rect = this.element.getBoundingClientRect();
            const points = [
                { x: this.x + rect.width / 2, y: this.y },
                { x: this.x + rect.width / 2, y: this.y + rect.height },
                { x: this.x, y: this.y + rect.height / 2 },
                { x: this.x + rect.width, y: this.y + rect.height / 2 }
            ];
            let minDistance = Infinity, bestPoint = points[0];
            const otherCenterX = otherNode.x + otherNode.element.offsetWidth / 2;
            const otherCenterY = otherNode.y + otherNode.element.offsetHeight / 2;
            points.forEach(p => {
                const dist = Math.hypot(p.x - otherCenterX, p.y - otherCenterY);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestPoint = p;
                }
            });
            return bestPoint;
        }

        triggerEvent(eventName, ...args) {
            if (!isRunning) return;
            this.connections.filter(conn => conn.event === eventName).forEach(conn => {
                const target = machineInstances.find(inst => inst.id === conn.targetId);
                if (target && target.getMethods()[conn.method]) {
                    target.getMethods()[conn.method](...args);
                }
            });
        }

        remove() {
            this.connections.forEach(conn => {
                conn.line.remove();
                conn.label.remove();
            });
            machineInstances.forEach(inst => {
                inst.connections = inst.connections.filter(conn => {
                    if(conn.targetId === this.id) {
                        conn.line.remove();
                        conn.label.remove();
                        return false;
                    }
                    return true;
                });
            });
            this.element.remove();
        }
    }

    // --- Component Child Classes ---

    class Button extends MachineComponent {
        constructor(x, y) { super('Button', x, y); this.element.addEventListener('click', () => this.onClick()); }
        getHTML() { return `<div class="icon"><i class="fas fa-mouse-pointer"></i></div><div class="label">Button</div>`; }
        getEvents() { return { 'click': 'When clicked' }; }
        getMethods() { return {}; }
        onClick() { this.triggerEvent('click'); }
    }

    class Lightbulb extends MachineComponent {
        constructor(x, y) { super('Lightbulb', x, y); this.isOn = false; this.updateVisuals(); }
        getHTML() { return `<div class="icon"><i class="far fa-lightbulb"></i></div><div class="label">Lightbulb</div>`; }

        // MODIFICATION: Lightbulbs can now EMIT events.
        getEvents() {
            return {
                'turnOn': 'When turned ON',
                'turnOff': 'When turned OFF',
                'toggle': 'When toggled'
            };
        }

        getMethods() { return { 'turnOn': this.turnOn.bind(this), 'turnOff': this.turnOff.bind(this), 'toggle': this.toggle.bind(this) }; }

        turnOn() {
            this.isOn = true;
            this.updateVisuals();
            this.triggerEvent('turnOn'); // Fire event
        }
        turnOff() {
            this.isOn = false;
            this.updateVisuals();
            this.triggerEvent('turnOff'); // Fire event
        }
        toggle() {
            this.isOn = !this.isOn;
            this.updateVisuals();
            this.triggerEvent('toggle'); // Fire event
            // Also fire specific on/off event for more precise chaining
            this.triggerEvent(this.isOn ? 'turnOn' : 'turnOff');
        }

        updateVisuals() { this.element.querySelector('.icon i').className = this.isOn ? 'far fa-lightbulb light-on' : 'far fa-lightbulb light-off'; }
    }

    class RgbLight extends Lightbulb {
        constructor(x,y) { super(x,y); this.color = '#ffffff'; }
        getHTML() { return `<div class="icon"><i class="fas fa-lightbulb"></i></div><div class="label">RGB Light</div>`; }

        // MODIFICATION: RGB Lights can emit their own special event, plus parent events.
        getEvents() {
            return {
                ...super.getEvents(), // Inherit turnOn, turnOff, toggle
                'changeColor': 'When color changes'
            };
        }

        getMethods() { return { ...super.getMethods(), 'changeColor': this.changeColor.bind(this) }; }

        changeColor() {
            this.color = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'][Math.floor(Math.random() * 5)];
            this.updateVisuals();
            this.triggerEvent('changeColor'); // Fire event
        }

        updateVisuals() {
            const icon = this.element.querySelector('.icon i');
            icon.className = 'fas fa-lightbulb';
            icon.style.color = this.isOn ? this.color : '#7f8c8d';
            icon.style.textShadow = this.isOn ? `0 0 15px ${this.color}` : 'none';
        }
    }

    class Switch extends MachineComponent {
        constructor(x, y) { super('Switch', x, y); this.isOn = false; this.element.addEventListener('click', () => this.onClick()); this.updateVisuals(); }
        getHTML() { return `<div class="icon"><i class="fas fa-toggle-off"></i></div><div class="label">Switch</div>`; }
        getEvents() { return { 'turnOn': 'When turned ON', 'turnOff': 'When turned OFF' }; }
        getMethods() { return {}; }
        onClick() { if (!isRunning) return; this.isOn = !this.isOn; this.updateVisuals(); this.triggerEvent(this.isOn ? 'turnOn' : 'turnOff'); }
        updateVisuals() { this.element.querySelector('.icon i').className = this.isOn ? 'fas fa-toggle-on switch-on' : 'fas fa-toggle-off switch-off'; }
    }

    class Speaker extends MachineComponent {
        constructor(x, y) { super('Speaker', x, y); this.audioCtx = null; }
        getHTML() { return `<div class="icon"><i class="fas fa-volume-up"></i></div><div class="label">Speaker</div>`; }
        getMethods() { return { 'playSound': this.playSound.bind(this) }; }
        playSound() {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
            osc.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.5);
        }
    }

    const componentFactory = { Button, Lightbulb, Switch, Speaker, RgbLight };

    // --- DRAG AND DROP & WIRING LOGIC (No changes) ---
    function initWiring(e) {
        e.stopPropagation(); if (isRunning) return;
        const startPoint = e.target;
        const startComponentEl = startPoint.closest('.machine-component');
        wiringState.startComponent = machineInstances.find(inst => inst.id === parseInt(startComponentEl.dataset.id));
        const previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        previewLine.setAttribute('stroke', '#e74c3c');
        previewLine.setAttribute('stroke-width', '4');
        previewLine.setAttribute('stroke-dasharray', '8,4');
        connectionsSvg.appendChild(previewLine);
        wiringState.previewLine = previewLine;
        const startCoords = { x: startComponentEl.offsetLeft + startPoint.offsetLeft + startPoint.offsetWidth / 2, y: startComponentEl.offsetTop + startPoint.offsetTop + startPoint.offsetHeight / 2 };
        previewLine.setAttribute('x1', startCoords.x);
        previewLine.setAttribute('y1', startCoords.y);
        previewLine.setAttribute('x2', startCoords.x);
        previewLine.setAttribute('y2', startCoords.y);
        document.addEventListener('mousemove', onWiring);
        document.addEventListener('mouseup', endWiring);
    }
    function onWiring(e) {
        const canvasRect = canvas.getBoundingClientRect();
        const endX = e.clientX - canvasRect.left;
        const endY = e.clientY - canvasRect.top;
        wiringState.previewLine.setAttribute('x2', endX);
        wiringState.previewLine.setAttribute('y2', endY);
    }
    function endWiring(e) {
        const endEl = e.target;
        if (endEl.classList.contains('connection-point')) {
            const endComponentEl = endEl.closest('.machine-component');
            const endComponent = machineInstances.find(inst => inst.id === parseInt(endComponentEl.dataset.id));
            if (endComponent && endComponent.id !== wiringState.startComponent.id) {
                wiringState.endComponent = endComponent;
                openWiringModal();
            }
        }
        wiringState.previewLine.remove();
        document.removeEventListener('mousemove', onWiring);
        document.removeEventListener('mouseup', endWiring);
    }
    function openWiringModal() {
        const { startComponent, endComponent } = wiringState;
        document.getElementById('source-component-info').textContent = `${startComponent.type} #${startComponent.id}`;
        document.getElementById('target-component-info').textContent = `${endComponent.type} #${endComponent.id}`;
        const eventSelect = document.getElementById('event-select');
        const methodSelect = document.getElementById('method-select');
        eventSelect.innerHTML = Object.entries(startComponent.getEvents()).map(([key, val]) => `<option value="${key}">${val}</option>`).join('');
        methodSelect.innerHTML = Object.entries(endComponent.getMethods()).map(([key]) => `<option value="${key}">${key}()</option>`).join('');
        if (eventSelect.innerHTML === '' || methodSelect.innerHTML === '') {
            alert("Connection cannot be made. Source has no events or target has no methods.");
            closeWiringModal();
            return;
        }
        wiringModalOverlay.classList.remove('hidden');
    }
    function closeWiringModal() { wiringModalOverlay.classList.add('hidden'); wiringState = {}; }
    document.getElementById('connect-button').addEventListener('click', () => {
        const { startComponent, endComponent } = wiringState;
        const eventName = document.getElementById('event-select').value;
        const methodName = document.getElementById('method-select').value;
        if(eventName && methodName) {
            startComponent.connectTo(endComponent, eventName, methodName);
        }
        closeWiringModal();
    });
    document.getElementById('cancel-button').addEventListener('click', closeWiringModal);
    document.querySelectorAll('.component-draggable').forEach(el => {
        el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', el.dataset.type));
    });
    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        const rect = canvas.getBoundingClientRect();
        const instance = new componentFactory[type](e.clientX - rect.left - 70, e.clientY - rect.top - 40);
        machineInstances.push(instance);
        makeDraggable(instance);
    });
    function makeDraggable(instance) {
        let offsetX, offsetY;
        const el = instance.element;
        el.querySelectorAll('.connection-point').forEach(p => p.addEventListener('mousedown', initWiring));
        function onMouseDown(e) {
            if (isRunning || e.target.classList.contains('connection-point')) return;
            offsetX = e.clientX - el.getBoundingClientRect().left;
            offsetY = e.clientY - el.getBoundingClientRect().top;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
        function onMouseMove(e) {
            instance.x = e.clientX - canvas.getBoundingClientRect().left - offsetX;
            instance.y = e.clientY - canvas.getBoundingClientRect().top - offsetY;
            el.style.left = `${instance.x}px`;
            el.style.top = `${instance.y}px`;
            instance.updateConnections();
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        el.addEventListener('mousedown', onMouseDown);
    }
    const runButton = document.getElementById('run-button');
    const stopButton = document.getElementById('stop-button');
    const clearButton = document.getElementById('clear-button');
    runButton.addEventListener('click', () => {
        isRunning = true;
        runButton.classList.add('disabled');
        stopButton.classList.remove('disabled');
        document.querySelectorAll('.machine-component').forEach(el => el.classList.add('running'));
    });
    stopButton.addEventListener('click', () => {
        isRunning = false;
        runButton.classList.remove('disabled');
        stopButton.classList.add('disabled');
        document.querySelectorAll('.machine-component').forEach(el => el.classList.remove('running'));
        machineInstances.forEach(inst => { if (inst.type.includes('Light') || inst.type === 'Switch') { inst.isOn = false; inst.updateVisuals(); } });
    });
    clearButton.addEventListener('click', () => {
        if (isRunning) return;
        machineInstances.forEach(inst => inst.remove());
        machineInstances = [];
        nextId = 0;
    });
});
