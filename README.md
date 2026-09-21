# UniversalField
Implements unified accessor layer for all standard fields that accept user input. 

InputGateway is a wrapper for all types of user data fields. Instead of accessing the underlying DOM element directly, you can use InputGateway to access and modify the field's value. This creates a consistent set of events across both programmatic and browser access.

A Field wraps an InputGateway and adds control logic around it so that one field can be calculated based on another field. It also handles cascading calculations when multiple fields are dependent on each other.


# Assumptions

