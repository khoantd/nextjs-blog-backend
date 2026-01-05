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
 */
export function getPaginationOptions(req: Request): PaginationOptions {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
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
    const totalPages = Math.ceil(total / limit);

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
