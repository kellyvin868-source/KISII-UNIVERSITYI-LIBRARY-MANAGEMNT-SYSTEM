const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'nvidia/nemotron-3.5-lightning:free';
const REQUEST_TIMEOUT_MS = 30_000;

const extractTextContent = (content) => {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .filter((part) => part?.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('')
            .trim();
    }

    return '';
};

class AiServiceError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'AiServiceError';
        this.statusCode = statusCode;
    }
}

const requestModel = async (messages, maxTokens = 512) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new AiServiceError('AI service is not configured. Set OPENROUTER_API_KEY.', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                temperature: 0.2,
                max_tokens: maxTokens
            }),
            signal: controller.signal
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new AiServiceError('The AI provider request timed out. Try again later.', 504);
        }
        throw new AiServiceError('Unable to connect to the AI provider.', 502);
    } finally {
        clearTimeout(timeout);
    }

    if (response.status === 429) {
        throw new AiServiceError('The AI provider rate limit was reached. Try again later.', 503);
    }
    if (!response.ok) {
        throw new AiServiceError(`The AI provider returned HTTP ${response.status}.`, 502);
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new AiServiceError('The AI provider returned an invalid response.', 502);
    }

    const content = extractTextContent(result?.choices?.[0]?.message?.content);
    if (!content) {
        throw new AiServiceError('The AI provider response did not contain a reply.', 502);
    }

    return {
        content,
        model: typeof result.model === 'string' ? result.model : MODEL
    };
};

const generateLibraryAssistantResponse = async (message) => {
    const result = await requestModel([
        {
            role: 'system',
            content: 'You are the Kisii University Library assistant. Answer clearly and do not invent library policies, book availability, member records, due dates, or fines. No live member, loan, or policy records are provided; say when you cannot verify something and direct the user to library staff. Never ask for passwords, payment PINs, or unnecessary personal information.'
        },
        { role: 'user', content: message }
    ]);

    return { reply: result.content, model: result.model };
};

const parseJsonContent = (content, purpose) => {
    try {
        return JSON.parse(content);
    } catch {
        throw new AiServiceError(`The AI provider returned invalid ${purpose}.`, 502);
    }
};

const extractCatalogSearchTerms = async (query) => {
    const result = await requestModel([
        {
            role: 'system',
            content: 'Convert a library catalog search written in natural language into a JSON object with one property, "terms", containing an array of up to 6 short literal search phrases. Include important topic, title, author, or ISBN words. Do not answer the search request. Return only valid JSON.'
        },
        { role: 'user', content: query }
    ], 128);

    const parsed = parseJsonContent(result.content, 'search terms');

    if (!Array.isArray(parsed.terms) || parsed.terms.length === 0) {
        throw new AiServiceError('The AI provider did not return any search terms.', 502);
    }

    const terms = parsed.terms
        .filter((term) => typeof term === 'string')
        .map((term) => term.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 6);

    if (terms.length === 0) {
        throw new AiServiceError('The AI provider did not return any usable search terms.', 502);
    }

    return { terms, model: result.model };
};

const generateRecommendations = async (history, candidates) => {
    const result = await requestModel([
        {
            role: 'system',
            content: 'Recommend up to 5 books from the supplied candidate list based on the member’s borrowed book subjects. Return only JSON with a "bookIds" array. Use only exact candidate IDs; never invent books or IDs.'
        },
        {
            role: 'user',
            content: JSON.stringify({ borrowedBooks: history, candidates })
        }
    ], 256);
    const parsed = parseJsonContent(result.content, 'recommendations');
    if (!Array.isArray(parsed.bookIds)) {
        throw new AiServiceError('The AI provider did not return valid recommendations.', 502);
    }
    const allowed = new Set(candidates.map((book) => book.id));
    const bookIds = [...new Set(parsed.bookIds.filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, 5);
    return { bookIds, model: result.model };
};

const suggestCategories = async (title, description, categories) => {
    const result = await requestModel([
        {
            role: 'system',
            content: 'Classify the book into up to 3 of the supplied categories. Return only JSON with a "categoryIds" array. Use exact category IDs and do not invent IDs.'
        },
        {
            role: 'user',
            content: JSON.stringify({ title, description, categories })
        }
    ], 256);
    const parsed = parseJsonContent(result.content, 'category suggestions');
    if (!Array.isArray(parsed.categoryIds)) {
        throw new AiServiceError('The AI provider did not return valid category suggestions.', 502);
    }
    const allowed = new Set(categories.map((category) => category.id));
    const categoryIds = [...new Set(parsed.categoryIds.filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, 3);
    return { categoryIds, model: result.model };
};

module.exports = {
    AiServiceError,
    extractCatalogSearchTerms,
    generateLibraryAssistantResponse,
    generateRecommendations,
    suggestCategories
};
