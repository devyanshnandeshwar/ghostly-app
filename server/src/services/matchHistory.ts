/**
 * How much match history a session carries.
 *
 * pastMatches was appended to with $addToSet and pruned by nothing, so it grew
 * for the life of the account. It is mirrored into the cached session view and
 * consulted for every candidate on every join, so its cost is paid constantly
 * rather than at rest.
 *
 * Capping it trades perfect memory for bounded cost: once someone passes the
 * cap, their oldest partners become matchable again. For an ephemeral chat
 * whose sessions expire after thirty days of inactivity anyway, meeting someone
 * again after a few hundred conversations is a better outcome than an
 * unbounded array -- and far better than the alternative it was heading for,
 * where a heavy user eventually cannot be matched with anyone.
 */
export const MAX_REMEMBERED_MATCHES = 200;

export interface RememberMatchUpdate {
    $push: {
        pastMatches: {
            $each: string[];
            /** Negative keeps the tail, i.e. the most recent entries. */
            $slice: number;
        };
    };
}

export function rememberMatchUpdate(partnerSessionId: string): RememberMatchUpdate {
    return {
        $push: {
            pastMatches: {
                $each: [partnerSessionId],
                $slice: -MAX_REMEMBERED_MATCHES
            }
        }
    };
}
