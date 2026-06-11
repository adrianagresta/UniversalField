/**
 * Supported event types emitted by the InputGateway.
 */
enum InputGatewayEvents {
    jschange = "JSCHANGE", input = "INPUT", change = "CHANGE", blur = "BLUR", focus = "FOCUS"
}

/**
 * A gateway class for managing HTML input elements, facilitating value manipulation 
 * and event handling, including support for elements not yet present in the DOM.
 */
class InputGateway {
    /** The CSS selector used to identify the target element. */
    private cssSelector: string;
    /** A Promise that resolves to the DOM element instance managed by this gateway. */
    private element: Promise<HTMLElement>;
    /** A Promise that resolves to the lowercased tag name of the element. */
    private elementTag: Promise<string>;
    /** A mapping of event types to registered callback functions. */
    private eventHandlers: Record<InputGatewayEvents, Function[]>;

    /** Internal resolver for the element promise. */
    private resolveElement!: (value: HTMLElement) => void;
    /** Internal resolver for the elementTag promise. */
    private resolveElementTag!: (value: string) => void;

    /** The global MutationObserver used to track DOM changes for dynamically added elements. */
    private static mutationObserver: MutationObserver;
    /** A set of InputGateway instances waiting for their target elements to be added to the DOM. */
    private static missing: Set<InputGateway>;

    /**
     * Initializes a new instance of InputGateway.
     * @param cssSelector - The CSS selector for the target element.
     */
    constructor(cssSelector: string) {
        this.eventHandlers = {} as Record<InputGatewayEvents, Function[]>; // Initialize eventHandlers
        this.cssSelector = cssSelector;

        this.element = new Promise((resolve) => { this.resolveElement = resolve; });
        this.elementTag = new Promise((resolve) => { this.resolveElementTag = resolve; });

        let target = document.querySelector(cssSelector);
        if (target) {
            this.resolveElement(target as HTMLElement);
            this.resolveElementTag(target.tagName.toLowerCase());
            this.init();
        } else {
            InputGateway.missing.add(this);
            if (InputGateway.missing.size === 1) {
                InputGateway.registerMutationObserver();
            }
        }
    }

    /**
     * Initializes event listeners on the element.
     */
    private async init() {
        const el = await this.element;
        // register for input, change, focus, and blur events on source tag
        el.addEventListener('input', this.inputHandler.bind(this));
        el.addEventListener('change', this.changeHandler.bind(this));
        el.addEventListener('focus', this.focusHandler.bind(this));
        el.addEventListener('blur', this.blurHandler.bind(this));
    }

    /**
     * Because we have no way of knowing if the gateway is connected to a field that exists
     * now, this funciton returns a promise for a value. 
     * @param attributeName - the name of an attribute to fetch
     * @returns a Promise for a string value
     */
    public async getAttribute(attributeName: string): Promise<string> {
        const el = await this.element;
        return el.getAttribute(attributeName) || "";
    }

    /**
     * Receive event and rebroadcast.
     * @param evt - The InputEvent data from the source element.
     */
    public inputHandler(evt: InputEvent): void {
        // fetch relevant data from source event
        let data = {
            data: evt.data,
            target: evt.target as HTMLElement,
            type: InputGatewayEvents.input
        };

        // rebroadcast this event
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

    static {
        InputGateway.missing = new Set<InputGateway>();
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
    public async set(value: string | number | boolean): Promise<void> {
        // get tag name
        const tag = await this.elementTag;
        switch (tag) {
            case "input":
                await this.setInput(value);
                break;
            case "textarea":
                await this.setTextArea(value);
                break;
            case "select":
                let stringValue = "" + value;
                await this.setSelect(stringValue);
                break;
            default:
                throw new Error("Unsupported tag name: " + this.elementTag);
        }

    }

    /**
     * Like set() but for multiple value inputs
     * @param values - The new values to assign.
     */
    public async setMulti(values: (string | number | boolean)[]): Promise<void> {
        const tag = await this.elementTag;
        switch (tag) {
            case "select":
                await this.setSelectMulti(values);
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
    public async get(): Promise<string | number | boolean> {
        const tag = await this.elementTag;
        switch (tag) {
            case "input":
                return await this.getInput();
            case "textarea":
                return await this.getTextArea();
            case "select":
                return await this.getSelect();
            default:
                throw new Error("Unsupported tag name: " + this.elementTag);
        }
    }

    /**
     * Retrieve the current value(s) from the controlled element.
     * For single-valued data, returns an array containing one value.
     * @returns An array containing the current value(s).
     */
    public async getMulti(): Promise<(string | number | boolean)[]> {
        const tag = await this.elementTag;
        switch (tag) {
            case "select":
                return await this.getSelectMulti();
            default:
                return [await this.get()];
        }
    }

    /**
     * Coerces element to input and sets its value.
     * @param value - The value to set on the input element.
     */
    private async setInput(value: string | number | boolean): Promise<void> {
        const field = (await this.element) as HTMLInputElement;
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
    private async getInput(): Promise<string | number | boolean> {
        const field = (await this.element) as HTMLInputElement;
        switch (field.type) {
            case "checkbox":
                return field.checked;

            case "radio": {
                const groupName = field.name;
                if (groupName) {
                    const radioGroup = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${groupName}"]`);
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
    private async setTextArea(value: string | number | boolean): Promise<void> {
        ((await this.element) as HTMLTextAreaElement).value = String(value);
    }

    /**
     * Retrieves the current value of the textarea.
     * @returns The textarea value.
     */
    private async getTextArea(): Promise<string> {
        return ((await this.element) as HTMLTextAreaElement).value;
    }

    /**
     * Coerces element to select and sets its value
     * @param value - The string value to select.
     */
    private async setSelect(value: string): Promise<void> {
        ((await this.element) as HTMLSelectElement).value = value;
    }

    /**
     * Retrieves the current selected value of the select element.
     * @returns The selected value.
     */
    private async getSelect(): Promise<string> {
        const selectElement = (await this.element) as HTMLSelectElement;
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
    private async getSelectMulti(): Promise<(string | number | boolean)[]> {
        const selectElement = (await this.element) as HTMLSelectElement;
        return Array.from(selectElement.selectedOptions).map((option) => option.value);
    }

    /**
     * Sets multiple options in a select element to selected state based on matching values.
     * @param values - Array of values to match and select.
     */
    private async setSelectMulti(values: (string | number | boolean)[]): Promise<void> {
        const selectElement = (await this.element) as HTMLSelectElement;
        const coercedValues = new Set(values.map((value) => String(value)));

        Array.from(selectElement.options).forEach((option) => {
            const text = option.textContent?.trim() ?? "";
            option.selected = coercedValues.has(option.value) || coercedValues.has(text);
        });
    }

    /**
     * Registers the MutationObserver to handle dynamically added elements.
     */
    public static registerMutationObserver() {
        InputGateway.mutationObserver = new MutationObserver(InputGateway.observerCallback);
        InputGateway.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * Stops the MutationObserver.
     */
    public static deregisterMutationObserver() {
        InputGateway.mutationObserver.disconnect();
    }

    /**
     * Observer callback that checks for new nodes matching missing gateways.
     * @param mutationList - List of mutations.
     * @param observer - The MutationObserver instance.
     */
    private static observerCallback(
        mutationList: MutationRecord[],
        observer: MutationObserver
    ) {
        // Optimize check: Only run querySelector if nodes were actually added
        const hasAdditions = mutationList.some(record => record.addedNodes.length > 0);
        if (!hasAdditions) return;

        for (let record of mutationList) {
            if (record.type === 'childList') {
                for (let needsMatch of Array.from(InputGateway.missing)) {
                    let target = document.querySelector(needsMatch.cssSelector);
                    if (target) {
                        needsMatch.resolveElement(target as HTMLElement);
                        needsMatch.resolveElementTag(target.tagName.toLowerCase());
                        needsMatch.init();
                        InputGateway.missing.delete(needsMatch);
                        if (InputGateway.missing.size === 0) {
                            InputGateway.deregisterMutationObserver();
                        }
                    }
                }
            }
        }
    }


}

export default InputGateway;
export { InputGatewayEvents };
