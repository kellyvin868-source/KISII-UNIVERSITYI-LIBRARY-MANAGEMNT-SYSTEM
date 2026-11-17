const serializeMongoRecord = (record) => {
    const data = typeof record.toObject === 'function' ? record.toObject() : record;
    const { _id, ...fields } = data;
    return { id: String(_id), ...fields };
};

module.exports = serializeMongoRecord;
