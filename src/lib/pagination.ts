import { Request } from 'express';

export interface PaginationOptions {
    page: number;
    limit: number;
    skip: number;
}

export interface PaginationResult<T> {
    items: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

/**
 * Parses pagination parameters from the request query.
 * Default page: 1, Default limit: 20
 * Max limit: 500 (can be overridden with maxLimit parameter)
 * Special: limit=0 or limit=all fetches all records
 */
export function getPaginationOptions(req: Request, maxLimit: number = 500): PaginationOptions {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limitParam = req.query.limit as string;
    
    // Handle special cases: 0 or "all" means fetch all records
    if (limitParam === '0' || limitParam?.toLowerCase() === 'all') {
        return { page: 1, limit: 0, skip: 0 }; // 0 means no limit
    }
    
    const requestedLimit = parseInt(limitParam) || 20;
    const limit = requestedLimit === 0 ? 0 : Math.max(1, Math.min(maxLimit, requestedLimit));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
}

/**
 * Formats the response with pagination metadata.
 */
export function formatPaginatedResponse<T>(
    items: T[],
    total: number,
    options: PaginationOptions
): PaginationResult<T> {
    const { page, limit } = options;
    // Handle division by zero when limit is 0 (fetching all records)
    const totalPages = limit === 0 ? 1 : Math.ceil(total / limit);

    return {
        items,
        pagination: {
            total,
            page,
            limit,
            totalPages,
        },
    };
}
