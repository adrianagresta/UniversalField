import type InputGateway from "./InputGateway";
import { InputGatewayEvents } from "./InputGateway";

type TDictators = {
    [dict_key: string]: Field;
}


/**
 * Global accessible registry of Fields. Used when one field 
 * wants to address another field. 
 */
class FieldRegistry {
    static fields: TDictators;

    public static registerField(field: Field) {
        let name = field.getFieldName();
        if (FieldRegistry.fields[name] != undefined) {
            throw new Error("Field already registered: " + name);
        }
        FieldRegistry.fields[name] = field;
    }

    public static getNames(): string[] {
        return Object.keys(FieldRegistry.fields);
    }

    public static getField(name: string): Field {
        if (FieldRegistry.fields[name] == undefined) {
            throw new Error("Field not found: " + name);
        }
        return FieldRegistry.fields[name];
    }

}

/**
 * A Field wraps an individual InputGateway and adds control logic around it.
 * It can perform calculations or implement gated logic based on other fields. 
 * 
 * Addressing a field requires the field to place a value in the "fieldname" 
 * (case sensitive) attribute. When the fieldname attribute is populated, 
 * the field will be added to the field registry. 
 * 
 * Fields are registered with a FieldRegistry and can be accessed by name.
 */
class Field {
    // Target InputGateway that this field controls.
    private target: InputGateway;

    // Any change in target value turns on this bit
    private isDirty: boolean;

    // This is a unique identifier for the field, taken from the element's fieldname attribute
    private fieldName: string;

    // This is the field's calculation string, if any
    private calculation: FieldCalculation | null;

    // When one of these is updated, we need to rerun the calculation for this field. 
    private uses: InputGateway[] = [];

    constructor(gateway: InputGateway) {
        this.target = gateway;
        this.isDirty = false;
        this.fieldName = this.target.getAttribute("fieldname"); // mandatory

        let boundChangeHandler = this.changeHandler.bind(this);
        this.target.addHandler(InputGatewayEvents.change, boundChangeHandler);

        let calculationString = this.target.getAttribute("calculation"); // optional
        if (!calculationString || calculationString.trim() === "") {
            this.calculation = null;
        } else {
            this.calculation = new FieldCalculation(calculationString);
        }

    }

    /**
     * When changeHandler is called, do the following:
     * 1) call FieldRegistry to get dependencies
     * 2) recalculate all dependencies
     * 3) clear dirty bit
     * @param evt 
     */
    private changeHandler(evt: Event) {
        this.markDirty();

        /*
        ToDO: if this is dirty, we need to run calculcations for all fields that use this one.
        Seems like we should check exsting value and new value, then compare them. If they're 
        different, we should continue cascading. 

        We WILL need a way to prevent cycles. 
         */

        this.clearDirty();
    }

    public markDirty() {
        this.isDirty = true;
    }

    public clearDirty() {
        this.isDirty = false;
    }

    public getFieldName() {
        return this.fieldName;
    }


}

/**
 * This class converts a string into a JavaScript function. 
 * References to fields are denoted by the delimiters "<<" and ">>". 
 * The contents thereof will be treated as a field name and retrieved 
 * from the field registry. 
 */
class FieldCalculation {
    private static readonly idstart = "<<";
    private static readonly idend = ">>";
    private calculation: Function

    constructor(expression: string) {
        this.calculation = this.parse(expression);
    }

    /**
     * Parses expression into a function
     */
    private parse(expression: string): Function {
        if (!expression || expression.trim() === "") {
            return new Function("return '';");
        }

        // We will iterate over this string and replace all field references with a call to the FieldRegistry.
        let returnValue = expression;

        // ToDo: 
        let fieldReferences = new Set(expression.match(/<<([^<>\s]*?)>>/g));
        for (let fieldReference of fieldReferences) {
            let functionCall = `FieldRegistry.getField("${fieldReference}").calculate()`;
            returnValue = expression.replaceAll(`<<${fieldReference}>>`, functionCall);
        }

        // return JS function
        return new Function("return " + returnValue + ";");
    }

    /**
     * Expression must only be parsed on registry version mismatch
     */
    public calculate() {
        return this.calculation();
    }
}