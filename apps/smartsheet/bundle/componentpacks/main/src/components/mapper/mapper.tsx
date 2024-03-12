import { definition, api, component } from "@uesio/ui"

type ComponentDefinition = {
	text: string
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
	const { context } = props
	const record = context.getRecord()
	const mappingWire = api.wire.useWire("mapping", context)
	if (!mappingWire) throw new Error("No wire named mapping")
	const mappingRecord = mappingWire.getFirstRecord()
	if (!mappingRecord) throw new Error("No record in mapping wire")
	const fieldMappings = mappingRecord.getFieldValue<Record<string, string>>(
		"uesio/smartsheet.fields"
	)
	const fieldName = record.getFieldValue<string>("uesio/core.name")
	if (!fieldName) throw new Error("No field name available")

	const sheetWire = api.wire.useWire("sheets", context)
	if (!sheetWire) throw new Error("No wire named sheets")
	const sheetRecord = sheetWire.getFirstRecord()
	if (!sheetRecord) throw new Error("No record in sheets wire")
	const columns = sheetRecord.getFieldValue(
		"uesio/smartsheet.columns"
	) as Column[]
	if (!columns) throw new Error("No columns provided by sheets wire")

	const selected = fieldMappings?.[fieldName]

	const options = columns.map((column) => ({
		label: column.title,
		value: column.id + "",
	}))

	options.unshift({
		label: "",
		value: "",
	})
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
								[fieldName]: value,
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
