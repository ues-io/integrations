import { definition, api, component } from "@uesio/ui"

type ComponentDefinition = {
	mappingWireName: string
	sheetWireName: string
}

type Column = {
	id: number
	index: string
	title: string
	type: string
}

const Component: definition.UC<ComponentDefinition> = (props) => {
	const SelectField = component.getUtility("uesio/io.selectfield")
	const FieldWrapper = component.getUtility("uesio/io.fieldwrapper")
	const MapField = component.getUtility("uesio/io.mapfield")
	const { context, definition } = props
	const { mappingWireName, sheetWireName } = definition
	const record = context.getRecord()
	const mappingWire = api.wire.useWire(mappingWireName, context)
	if (!mappingWire)
		throw new Error("No mapping wire found: " + mappingWireName)
	const mappingRecord = mappingWire.getFirstRecord()
	if (!mappingRecord) throw new Error("No record in mapping wire")
	const fieldMappings = mappingRecord.getFieldValue<Record<string, string>>(
		"uesio/smartsheet.fields"
	)
	const fieldName = record.getFieldValue<string>("uesio/core.name")
	if (!fieldName) throw new Error("No field name available")
	const fieldType = record.getFieldValue<string>("uesio/core.type")
	if (!fieldName) throw new Error("No field type available")
	const fieldNamespace = record.getFieldValue<string>("uesio/core.namespace")
	if (!fieldNamespace) throw new Error("No field namespace available")

	const fieldKey = fieldNamespace + "." + fieldName

	const sheetWire = api.wire.useWire(sheetWireName, context)
	if (!sheetWire) throw new Error("No sheet wire found: " + sheetWireName)
	const sheetRecord = sheetWire.getFirstRecord()
	if (!sheetRecord) throw new Error("No record in sheets wire")
	const columns = sheetRecord.getFieldValue(
		"uesio/smartsheet.columns"
	) as Column[]
	if (!columns) throw new Error("No columns provided by sheets wire")

	const options = columns.map((column) => ({
		label: column.title,
		value: column.id + "",
	}))

	options.unshift({
		label: "",
		value: "",
	})

	const selected = fieldMappings?.[fieldKey] || {}

	if (fieldType === "MAP") {
		return (
			<FieldWrapper context={context} variant="uesio/io.table">
				<MapField
					value={Object.fromEntries(
						Object.entries(selected).map(([k, v]) => [
							k,
							{ column: v },
						])
					)}
					setValue={(value: Record<string, { column: string }>) => {
						console.log("Beh", value)
						const modified = Object.fromEntries(
							Object.entries(value).map(([k, v]) => [k, v.column])
						)
						console.log("Modifieeed", modified)
						mappingRecord.update(
							"uesio/smartsheet.fields",
							{
								...fieldMappings,
								...{
									[fieldKey]: modified,
								},
							},
							context
						)
					}}
					mode="EDIT"
					options={{
						keyField: {
							name: "path",
							label: "Path",
							type: "TEXT",
							namespace: "",
							accessible: true,
							createable: true,
							updateable: true,
						},
						valueField: {
							name: "column",
							label: "Column",
							type: "STRUCT",
							subfields: {
								column: {
									name: "column",
									label: "Column",
									type: "SELECT",
									selectlist: {
										options,
									},
								},
							},
							namespace: "",
							accessible: true,
							createable: true,
							updateable: true,
						},
					}}
					context={context}
				/>
			</FieldWrapper>
		)
	}
	return (
		<FieldWrapper context={context} variant="uesio/io.table">
			<SelectField
				value={selected}
				setValue={(value: string) => {
					mappingRecord.update(
						"uesio/smartsheet.fields",
						{
							...fieldMappings,
							...{
								[fieldKey]: value,
							},
						},
						context
					)
				}}
				options={options}
				context={context}
			/>
		</FieldWrapper>
	)
}

export default Component
