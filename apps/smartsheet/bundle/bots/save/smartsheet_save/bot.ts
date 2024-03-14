import { FieldValue, SaveBotApi } from "@uesio/bots"

type Mapping = {
	"uesio/smartsheet.sheet": {
		"uesio/core.id": string
	}
	"uesio/smartsheet.fields": Record<string, unknown>
}

export default function smartsheet_save(bot: SaveBotApi) {
	const { collectionMetadata } = bot.saveRequest

	const collectionFullName =
		collectionMetadata.namespace + "." + collectionMetadata.name

	bot.deletes.get().forEach((deleteApi) => {
		bot.log.info("got a record to delete, with id: " + deleteApi.getId())
	})
	bot.inserts.get().forEach((insertApi) => {
		bot.log.info("got a record to insert, with id: " + insertApi.getId())
	})
	bot.updates.get().forEach((updateApi) => {
		bot.log.info("got a record to update, with id: " + updateApi.getId())
	})

	const handleErrorResponse = (
		response: ReturnType<typeof bot.http.request>
	) => {
		let errMessage = ""
		let responseObj: Record<string, object>
		if (typeof response.body === "string") {
			//bot.log.info("response body is string")
			try {
				responseObj = JSON.parse(response.body as string)
				if (responseObj.error) {
					errMessage = responseObj.error as unknown as string
				}
				// eslint-disable-next-line no-empty
			} catch (e) {}
		} else {
			errMessage = response.body as unknown as string
		}
		if (errMessage) {
			bot.log.error("error from smartsheets", errMessage)
		}
		bot.addError(JSON.stringify(errMessage), "", "")
	}

	const fieldsMetadata = collectionMetadata.getAllFieldMetadata()

	// Get the sheet id from the mapping record
	const mappingResult = bot.load({
		collection: "uesio/smartsheet.mapping",
		fields: [
			{
				id: "uesio/smartsheet.fields",
			},
			{
				id: "uesio/smartsheet.sheet",
			},
		],
		conditions: [
			{
				field: "collection",
				operator: "EQ",
				value: collectionFullName,
			},
		],
	})?.[0] as Mapping

	if (!mappingResult) {
		throw new Error(
			"Smartsheet load failed: No mapping provided for collection: " +
				collectionFullName
		)
	}

	const sheetId = mappingResult["uesio/smartsheet.sheet"]["uesio/core.id"]

	const fieldMappings = mappingResult["uesio/smartsheet.fields"]

	const get = (obj: Record<string, unknown>, path: string[]) => {
		// If path is not defined or it has false value
		if (!path) return undefined
		return path.reduce((prevObj, key) => prevObj && prevObj[key], obj)
	}

	const getCellChanges = (changeData: Record<string, FieldValue>) =>
		Object.keys(changeData).flatMap((fieldkey) => {
			const fieldMetadata = fieldsMetadata[fieldkey]
			const mappingValue = fieldMappings[fieldkey]
			if (!fieldMetadata || !mappingValue) return []
			if (fieldMetadata.type === "MAP") {
				const mappings = mappingValue as Record<string, string>
				return Object.entries(mappings).flatMap(([path, columnId]) => {
					const mapValue = changeData[fieldkey] as Record<
						string,
						unknown
					>
					if (!mapValue) {
						return []
					}
					const valueToSet = get(mapValue, path.split("->"))
					if (valueToSet === undefined) {
						return []
					}
					return [
						{
							columnId,
							value: valueToSet,
						},
					]
				})
			}
			const columnId = mappingValue as string
			return [
				{
					columnId,
					value: changeData[fieldkey],
				},
			]
		})

	const insertRequest = bot.inserts.get().map((insertApi) => ({
		toTop: true,
		cells: getCellChanges(insertApi.getAll()),
	}))

	const updateRequest = bot.updates.get().map((updateApi) => {
		const updateData = updateApi.getAll()
		return {
			id: updateData["uesio/core.id"],
			toTop: true,
			cells: getCellChanges(updateData),
		}
	})

	const deleteRequest = bot.deletes
		.get()
		.map((deleteApi) => deleteApi.getId())

	const url = "https://api.smartsheet.com/2.0/sheets/" + sheetId + "/rows"

	if (insertRequest.length) {
		bot.log.info("Insert Request", insertRequest)
		const response = bot.http.request({
			method: "POST",
			url,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			body: insertRequest as any,
		})

		bot.log.info(
			"[Smartsheet Insert Response]: " +
				response.code +
				", status=" +
				response.status +
				", body=" +
				JSON.stringify(response.body)
		)

		if (response.code !== 200) {
			handleErrorResponse(response)
			return
		}
	}

	if (updateRequest.length) {
		bot.log.info("Update Request", updateRequest)
		const response = bot.http.request({
			method: "PUT",
			url,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			body: updateRequest as any,
		})

		bot.log.info(
			"[Smartsheet Update Response]: " +
				response.code +
				", status=" +
				response.status +
				", body=" +
				JSON.stringify(response.body)
		)

		if (response.code !== 200) {
			handleErrorResponse(response)
			return
		}
	}

	if (deleteRequest.length) {
		bot.log.info("Delete Request", deleteRequest)
		const response = bot.http.request({
			method: "DELETE",
			url: url + "?ids=" + deleteRequest.join(","),
		})

		bot.log.info(
			"[Smartsheet Delete Response]: " +
				response.code +
				", status=" +
				response.status +
				", body=" +
				JSON.stringify(response.body)
		)

		if (response.code !== 200) {
			handleErrorResponse(response)
			return
		}
	}
}
