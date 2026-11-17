const verifyStudentRegistration = async (regNo) => {
    const baseUrl = process.env.STUDENT_REGISTRY_BASE_URL;
    const apiKey = process.env.STUDENT_REGISTRY_API_KEY;
    if (!baseUrl || !apiKey) {
        const error = new Error('Student registry integration is not configured.');
        error.statusCode = 503;
        throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(
            `${baseUrl.replace(/\/$/, '')}/students/${encodeURIComponent(regNo)}/verify`,
            {
                headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
                signal: controller.signal
            }
        );
        if (response.status === 404) return { verified: false, status: 'NOT_FOUND' };
        if (!response.ok) {
            const error = new Error(`Student registry returned HTTP ${response.status}.`);
            error.statusCode = 502;
            throw error;
        }
        const data = await response.json();
        if (typeof data.verified !== 'boolean') {
            const error = new Error('Student registry returned an invalid verification response.');
            error.statusCode = 502;
            throw error;
        }
        return {
            verified: data.verified,
            status: data.verified ? 'VERIFIED' : 'INACTIVE'
        };
    } catch (error) {
        if (error.statusCode) throw error;
        const providerError = new Error(
            error.name === 'AbortError' ? 'Student registry request timed out.' : 'Unable to reach the student registry.'
        );
        providerError.statusCode = error.name === 'AbortError' ? 504 : 502;
        throw providerError;
    } finally {
        clearTimeout(timeout);
    }
};

module.exports = { verifyStudentRegistration };