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

    public static async registerField(field: Field) {
        let name = await field.getFieldName();
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
 * Addressing a field requires the field to place a value in the fieldname 
 * attribute. When the fieldname attribute is populated, the field will be added
 * to the field registry. 
 */
class Field {
    // Target InputGateway that this field controls.
    private target: InputGateway;
    // Any change in target value turns on this bit
    private isDirty: boolean;
    // This is a unique identifier for the field, taken from the element's fieldname
    // attribute
    private fieldName: Promise<string>;

    private calculation: FieldCalculation | null;

    // When one of these is updated, we need to rerun the calculation for this field. 
    private uses: InputGateway[] = [];

    constructor(gateway: InputGateway) {
        this.target = gateway;
        this.isDirty = false;
        this.fieldName = this.target.getAttribute("fieldname");
        let boundChangeHandler = this.changeHandler.bind(this);
        this.target.addHandler(InputGatewayEvents.change, boundChangeHandler);
        this.calculation = null;
    }

    private changeHandler(evt: Event) {
        this.isDirty = true;
    }

    public setCalculation(calculation: string) {
        this.calculation = new FieldCalculation(calculation);
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

        // Find all id starts
        let stack: string[] = [expression];

        while (true) {
            let operatee = stack.pop() || "";

            // Have we run out of start markers?
            let startIndex = operatee.indexOf(FieldCalculation.idstart);
            if (startIndex == -1) break

            // Find the matching marker
            let endIndex = operatee.indexOf(FieldCalculation.idend, startIndex + FieldCalculation.idstart.length);
            if (endIndex == -1) throw new Error("Identifier missing end marker at index " + startIndex + " in \"" + operatee + "\"");

            // Generate the substitution (FieldRegistry exists in global context);
            stack.push(operatee.substring(0, startIndex));
            let fieldName = operatee.substring(startIndex + FieldCalculation.idstart.length, endIndex);
            let functionCall = `FieldRegistry.getField("${fieldName}").calculate()`;

            // Get the tail of the string
            stack.push(operatee.substring(endIndex + FieldCalculation.idend.length));
        }

        let functionString = stack.join("");

        // return JS function
        return new Function("return " + functionString + ";");
    }

    /**
     * Expression must only be parsed on registry version mismatch
     */
    public calculate() {
        return this.calculation();
    }
}