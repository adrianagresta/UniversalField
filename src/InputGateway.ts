/**
 * Supported event types emitted by the InputGateway.
 */
enum InputGatewayEvents {
    jschange = "JSCHANGE", input = "INPUT", change = "CHANGE", blur = "BLUR", focus = "FOCUS"
}

/**
 * Generates an InputGateway promise for a given CSS selector. Awaiting the promise means awaiting 
 * the presence of the element in the DOM. If present, it will return the InputGateway.
 * 
 */
class InputGatewayFactory {
    private static pendingGateways = new Set<{ selector: string, resolve: (gateway: InputGateway) => void }>();
    private static observer: MutationObserver | null = null;

    /**
     * If element with css selector exists, creates an InputGateway with existing element 
     * otherwise returns a Promise that will resolve to an InputGateway when the element is 
     * injected into the DOM. 
     * @param cssSelector - The CSS selector for the target element.
     * @returns A promise that will resolve to an InputGateway when the element is found.
     */
    public static async createInputGateway(cssSelector: string): Promise<InputGateway> {
        let existingGateways = document.querySelectorAll(cssSelector);
        if (existingGateways.length > 0) {
            return new InputGateway(cssSelector);
        }

        // if element is missing, monitor dom changes until we find it.
        return new Promise<InputGateway>((resolve) => {
            this.pendingGateways.add({ selector: cssSelector, resolve });

            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    const hasAdditions = mutations.some(record => record.addedNodes.length > 0);
                    if (!hasAdditions) return;

                    for (let pending of Array.from(this.pendingGateways)) {
                        if (document.querySelector(pending.selector)) {
                            pending.resolve(new InputGateway(pending.selector));
                            this.pendingGateways.delete(pending);
                        }
                    }

                    if (this.pendingGateways.size === 0 && this.observer) {
                        this.observer.disconnect();
                        this.observer = null;
                    }
                });
                this.observer.observe(document.body, { childList: true, subtree: true });
            }
        });
    }
}

var InputGateway_DEBUG = true;
/**
 * A gateway class for managing HTML input elements, facilitating value manipulation 
 * and event handling, including support for elements not yet present in the DOM.
 */
class InputGateway {
    // The DOM element instance managed by this gateway.
    private element: HTMLElement;

    // Mapping of event types to registered callback functions.
    private eventHandlers: Record<InputGatewayEvents, Function[]>;

    /**
     * Initializes a new instance of InputGateway.
     * @param cssSelector - The CSS selector for the target element.
     */
    constructor(cssSelector: string) {
        this.eventHandlers = {} as Record<InputGatewayEvents, Function[]>; // Initialize eventHandlers
        this.element = document.querySelector(cssSelector)!;
    }

    /**
     * Catches input, change, focus, and blur events on the element and rebroadcasts them
     * for Field objects to consume.
     */
    private init() {
        const boundInputHandler = this.inputHandler.bind(this);
        const boundChangeHandler = this.changeHandler.bind(this);
        const boundFocusHandler = this.focusHandler.bind(this);
        const boundBlurHandler = this.blurHandler.bind(this);

        this.element.addEventListener('input', boundInputHandler);
        this.element.addEventListener('change', boundChangeHandler);
        this.element.addEventListener('focus', boundFocusHandler);
        this.element.addEventListener('blur', boundBlurHandler);
    }

    /**
     * Because we have no way of knowing if the gateway is connected to a field that exists
     * now, this funciton returns a promise for a value. 
     * @param attributeName - the name of an attribute to fetch
     * @returns a Promise for a string value
     */
    public getAttribute(attributeName: string): string {
        const el = this.element;
        return el.getAttribute(attributeName) || "";
    }

    /**
     * Receive event and rebroadcast.
     * @param evt - The InputEvent data from the source element.
     */
    public inputHandler(evt: Event): void {
        // fetch relevant data from source event
        let data = {
            data: (evt as InputEvent).data,
            target: evt.target as HTMLElement,
            type: InputGatewayEvents.input
        };

        // rebroadcast this event
        if (InputGateway_DEBUG) console.log("InputGateway.inputHandler", data);
        this.emitEvent(data.type, { detail: data });
    }

    /**
     * Receive event and rebroadcast.
     * @param evt - The source event object.
     */
    private changeHandler(evt: Event): void {
        // fetch relevant data from source event
        let data = {
            target: evt.target as HTMLElement,
            type: InputGatewayEvents.change
        };

        // rebroadcast this event
        if (InputGateway_DEBUG) console.log("InputGateway.changeHandler", data);
        this.emitEvent(data.type, { detail: data });
    }

    /**
     * Receive event and rebroadcast.
     * @param evt - The source focus event.
     */
    private focusHandler(evt: FocusEvent): void {
        // fetch relevant data from source event
        let data = {
            target: evt.target as HTMLElement,
            type: InputGatewayEvents.focus
        };

        // rebroadcast this event
        this.emitEvent(data.type, { detail: data });
    }

    /**
     * Receive event and rebroadcast.
     * @param evt - The source focus event.
     */
    private blurHandler(evt: FocusEvent): void {
        // fetch relevant data from source event
        let data = {
            target: evt.target as HTMLElement,
            type: InputGatewayEvents.blur
        };

        // rebroadcast this event
        this.emitEvent(data.type, { detail: data });
    }

    /**
     * Adds a callback handler for a specific event type.
     * @param type - The event type.
     * @param callback - The function to call.
     */
    public addHandler(type: InputGatewayEvents, callback: Function) {
        if (this.eventHandlers[type] === undefined) {
            this.eventHandlers[type] = new Array<Function>();
        }
        this.eventHandlers[type].push(callback);
    }

    /**
     * Removes a callback handler for a specific event type.
     * @param type - The event type.
     * @param callback - The function to remove.
     */
    public removeHandler(type: InputGatewayEvents, callback: Function): void {
        if (this.eventHandlers[type] === undefined) {
            return; // already not there. SUCCESS!
        }
        let index = this.eventHandlers[type].indexOf(callback);
        if (index > -1) { // only remove the first instance
            this.eventHandlers[type].splice(index, 1);
        }
    }

    /**
     * Emits a custom event to all registered handlers.
     * @param type - The event type.
     * @param data - The data to emit.
     */
    public emitEvent(type: InputGatewayEvents, data: any) {
        let event = new CustomEvent(type, data);
        if (!this.eventHandlers || !this.eventHandlers[type] || this.eventHandlers[type].length === 0) return; // no handlers registered
        for (let i = 0; i < this.eventHandlers[type].length; ++i) {
            let callback = this.eventHandlers[type][i];
            if (!callback) continue; //paranoid error handling; this shouldn't happen
            callback(event);
        }
    }

    /**
     * Intelligently set the value of a data entry element. 
     * Could be input (any type), textarea, or select.
     * @param value - The new value to assign.
     */
    public set(value: string | number | boolean): void {
        // get tag name
        const tag = this.element.tagName.toLowerCase();
        switch (tag) {
            case "input":
                this.setInput(value);
                break;
            case "textarea":
                this.setTextArea(value);
                break;
            case "select":
                let stringValue = "" + value;
                this.setSelect(stringValue);
                break;
            default:
                throw new Error("Unsupported tag name: " + tag);
        }

    }

    /**
     * Like set() but for multiple value inputs
     * @param values - The new values to assign.
     */
    public setMulti(values: (string | number | boolean)[]): void {
        const tag = this.element.tagName.toLowerCase();
        switch (tag) {
            case "select":
                this.setSelectMulti(values);
                break;
            default:
                console.warn("setMulti() not supported for element type:", tag);
        }
    }

    /**
     * Retrieve the current value from the controlled element.
     * For multi-valued data, returns the first selected value.
     * @returns The current value of the element.
     */
    public get(): string | number | boolean {
        const tag = this.element.tagName.toLowerCase();
        switch (tag) {
            case "input":
                return this.getInput();
            case "textarea":
                return this.getTextArea();
            case "select":
                return this.getSelect();
            default:
                throw new Error("Unsupported tag name: " + tag);
        }
    }

    /**
     * Retrieve the current value(s) from the controlled element.
     * For single-valued data, returns an array containing one value.
     * @returns An array containing the current value(s).
     */
    public getMulti(): (string | number | boolean)[] {
        const tag = this.element.tagName.toLowerCase();
        switch (tag) {
            case "select":
                return this.getSelectMulti();
            default:
                return [this.get()];
        }
    }

    /**
     * Coerces element to input and sets its value.
     * @param value - The value to set on the input element.
     */
    private setInput(value: string | number | boolean): void {
        const field = this.element as HTMLInputElement;
        const type = field.type;

        switch (type) {
            case "text":
            case "email":
            case "password":
            case "tel":
            case "url":
            case "search":
            case "number":
            case "date":
            case "datetime-local":
            case "time":
            case "month":
            case "week":
                field.value = String(value);
                break;

            case "checkbox":
                if (typeof value === "boolean") {
                    field.checked = value;
                } else {
                    field.checked = String(value) === field.value || String(value).toLowerCase() === "true";
                }
                break;

            case "radio":
                const groupName = field.name;
                if (groupName) {
                    const radioGroup = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${groupName}"]`);
                    radioGroup.forEach((radio) => {
                        radio.checked = radio.value === String(value);
                    });
                } else {
                    field.checked = field.value === String(value);
                }
                break;

            default:
                field.value = String(value);
        }
    }

    /**
     * Retrieves the current value of the input element.
     * @returns The value of the element.
     */
    private getInput(): string | number | boolean {
        const field = this.element as HTMLInputElement;
        switch (field.type) {
            case "checkbox":
                return field.checked;

            case "radio": {
                const groupName = field.name;
                if (groupName) {
                    const radioGroup = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${groupName}"]`));
                    for (const radio of radioGroup) {
                        if (radio.checked) {
                            return radio.value;
                        }
                    }
                    return "";
                }
                return field.checked ? field.value : "";
            }

            case "number":
            case "range": {
                const rawValue = field.value;
                if (rawValue === "") return "";
                const numericValue = Number(rawValue);
                return Number.isNaN(numericValue) ? rawValue : numericValue;
            }

            case "text":
            case "email":
            case "password":
            case "tel":
            case "url":
            case "search":
            case "date":
            case "datetime-local":
            case "time":
            case "month":
            case "week":
            case "color":
                return field.value;

            default:
                return field.value;
        }
    }

    /**
     * Coerces element to text area and sets its value
     * @param value new text input
     */
    private setTextArea(value: string | number | boolean): void {
        (this.element as HTMLTextAreaElement).value = String(value);
    }

    /**
     * Retrieves the current value of the textarea.
     * @returns The textarea value.
     */
    private getTextArea(): string {
        return (this.element as HTMLTextAreaElement).value;
    }

    /**
     * Coerces element to select and sets its value
     * @param value - The string value to select.
     */
    private setSelect(value: string): void {
        ((this.element) as HTMLSelectElement).value = value;
    }

    /**
     * Retrieves the current selected value of the select element.
     * @returns The selected value.
     */
    private getSelect(): string {
        const selectElement = this.element as HTMLSelectElement;
        if (selectElement.multiple) {
            const first = Array.from(selectElement.selectedOptions)[0];
            return first ? first.value : "";
        }
        return selectElement.value;
    }

    /**
     * Retrieves all selected values of a multi-select element.
     * @returns Array of selected values.
     */
    private getSelectMulti(): (string | number | boolean)[] {
        const selectElement = this.element as HTMLSelectElement;
        return Array.from(selectElement.selectedOptions).map((option) => option.value);
    }

    /**
     * Sets multiple options in a select element to selected state based on matching values.
     * @param values - Array of values to match and select.
     */
    private setSelectMulti(values: (string | number | boolean)[]): void {
        const selectElement = this.element as HTMLSelectElement;
        const coercedValues = new Set(values.map((value) => String(value)));

        Array.from(selectElement.options).forEach((option) => {
            const text = option.textContent?.trim() ?? "";
            option.selected = coercedValues.has(option.value) || coercedValues.has(text);
        });
    }
}



export default InputGateway;
export { InputGatewayEvents, InputGatewayFactory };
