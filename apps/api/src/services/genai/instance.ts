import { AIGateway } from "./gateway.js";

/**
 * Singleton instance of AIGateway.
 * Dùng chung trên toàn hệ thống để thống nhất cooldown key và bộ đếm stats.
 */
export const aiGateway = new AIGateway();
