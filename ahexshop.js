const axios = require('axios');

/**
 * Task status enumeration
 */
const TaskStatus = {
    PENDING: 0,
    PROCESSING: 1,
    COMPLETED: 2,
    FAILED: 3
};

/**
 * Task priority enumeration
 */
const TaskPriority = {
    NORMAL: 1,
    HIGH: 2,
    URGENT: 3
};

/**
 * Custom exception for Device API errors
 */
class DeviceAPIException extends Error {
    constructor(message, errorCode = null, statusCode = null) {
        super(message);
        this.name = 'DeviceAPIException';
        this.errorCode = errorCode;
        this.statusCode = statusCode;
    }
}

/**
 * Node.js client for Device API System
 * 
 * This client provides a comprehensive interface to interact with the Device API,
 * including task creation, management, monitoring, and statistics.
 */
class DeviceAPIClient {
    /**
     * Initialize the Device API client
     * 
     * @param {string} apiUrl - Base API URL (e.g., "https://yourdomain.com/api/device")
     * @param {string} accessToken - User access token from /access command
     * @param {number} timeout - Request timeout in milliseconds (default: 30000)
     */
    constructor(apiUrl, accessToken, timeout = 30000) {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.accessToken = accessToken;
        this.timeout = timeout;
        
        // Create axios instance with default configuration
        this.axios = axios.create({
            baseURL: this.apiUrl,
            timeout: this.timeout,
            headers: {
                'X-API-Token': accessToken,
                'Content-Type': 'application/json',
                'User-Agent': 'DeviceAPIClient-NodeJS/1.0'
            }
        });
        
        // Add response interceptor for error handling
        this.axios.interceptors.response.use(
            response => response,
            error => {
                if (error.code === 'ECONNABORTED') {
                    throw new DeviceAPIException(
                        `Request timeout after ${this.timeout / 1000} seconds`,
                        'TIMEOUT'
                    );
                }
                
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                    throw new DeviceAPIException(
                        'Connection error - unable to reach API server',
                        'CONNECTION_ERROR'
                    );
                }
                
                throw new DeviceAPIException(
                    `Request error: ${error.message}`,
                    'REQUEST_ERROR'
                );
            }
        );
    }

    /**
     * Make HTTP request to API endpoint
     * 
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} endpoint - API endpoint path
     * @param {Object} data - Request body data
     * @param {Object} params - URL parameters
     * @returns {Promise<Object>} API response data
     * @throws {DeviceAPIException} If API request fails
     */
    async _makeRequest(method, endpoint, data = null, params = null) {
        try {
            const config = {
                method: method.toLowerCase(),
                url: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
                data,
                params
            };

            const response = await this.axios.request(config);
            const responseData = response.data;

            // Check if request was successful
            if (!responseData.success) {
                throw new DeviceAPIException(
                    responseData.message || 'Unknown error',
                    responseData.error_code,
                    response.status
                );
            }

            return responseData;

        } catch (error) {
            if (error instanceof DeviceAPIException) {
                throw error;
            }

            // Handle axios errors
            if (error.response) {
                // Server responded with error status
                let responseData;
                try {
                    responseData = error.response.data;
                } catch (e) {
                    throw new DeviceAPIException(
                        `Invalid JSON response: ${error.response.data?.substring(0, 200) || 'No data'}`,
                        'INVALID_JSON',
                        error.response.status
                    );
                }

                throw new DeviceAPIException(
                    responseData.message || `HTTP Error ${error.response.status}`,
                    responseData.error_code,
                    error.response.status
                );
            }

            throw error;
        }
    }

    /**
     * Create a new device task
     * 
     * @param {string} accountInfo - Account credentials in format "email|password"
     * @param {number|Object} priority - Task priority (1=normal, 2=high, 3=urgent)
     * @returns {Promise<Object>} Task creation response with task_id and details
     * @throws {DeviceAPIException} If task creation fails
     */
    async createTask(accountInfo, priority = TaskPriority.NORMAL) {
        if (typeof priority === 'object' && priority.value !== undefined) {
            priority = priority.value;
        }

        const data = {
            account_info: accountInfo,
            priority: priority
        };

        const response = await this._makeRequest('POST', 'create.php', data);
        return response.data || {};
    }

    /**
     * Get user's device tasks with filtering and pagination
     * 
     * @param {number} limit - Number of tasks to return (max 100, default 20)
     * @param {number} offset - Offset for pagination (default 0)
     * @param {string} status - Filter by status (all/pending/processing/completed/failed)
     * @param {string} priority - Filter by priority (all/1/2/3)
     * @returns {Promise<Object>} Tasks list with pagination and statistics
     */
    async getTasks(limit = 20, offset = 0, status = 'all', priority = 'all') {
        const params = {
            limit: Math.min(limit, 100),
            offset: Math.max(offset, 0),
            status,
            priority
        };

        const response = await this._makeRequest('GET', 'list.php', null, params);
        return response.data || {};
    }

    /**
     * Get detailed information about a specific task
     * 
     * @param {number} taskId - Task ID
     * @returns {Promise<Object>} Detailed task information with timing and logs
     */
    async getTask(taskId) {
        const params = { task_id: taskId };
        const response = await this._makeRequest('GET', 'get.php', null, params);
        return response.data || {};
    }

    /**
     * Cancel a pending task
     * 
     * @param {number} taskId - Task ID to cancel
     * @returns {Promise<Object>} Cancellation confirmation
     * @throws {DeviceAPIException} If task cannot be cancelled
     */
    async cancelTask(taskId) {
        const data = { task_id: taskId };
        const response = await this._makeRequest('POST', 'cancel.php', data);
        return response.data || {};
    }

    /**
     * Retry a failed task
     * 
     * @param {number} taskId - Task ID to retry
     * @returns {Promise<Object>} Retry confirmation
     * @throws {DeviceAPIException} If task cannot be retried
     */
    async retryTask(taskId) {
        const data = { task_id: taskId };
        const response = await this._makeRequest('POST', 'retry.php', data);
        return response.data || {};
    }

    /**
     * Get comprehensive user statistics
     * 
     * @returns {Promise<Object>} User statistics including overall, today, week, and priority breakdown
     */
    async getStatistics() {
        const response = await this._makeRequest('GET', 'stats.php');
        return response.data || {};
    }

    // ===================== CONVENIENCE METHODS =====================

    /**
     * Create a task and wait for completion
     * 
     * @param {string} accountInfo - Account credentials
     * @param {number|Object} priority - Task priority
     * @param {number} timeout - Maximum wait time in seconds (default 600)
     * @param {number} checkInterval - Check interval in seconds (default 10)
     * @returns {Promise<Object>} Final task result
     * @throws {DeviceAPIException} If task creation fails or timeout occurs
     */
    async createAndWait(accountInfo, priority = TaskPriority.NORMAL, timeout = 600, checkInterval = 10) {
        console.log(`🚀 Creating device task for: ${accountInfo.split('|')[0]}`);

        // Create task
        const createResult = await this.createTask(accountInfo, priority);
        const taskId = createResult.task_id;

        console.log(`✅ Task created! ID: #${taskId}`);
        console.log(`⏳ Waiting for completion (timeout: ${timeout}s, check every ${checkInterval}s)`);

        return await this.waitForCompletion(taskId, timeout, checkInterval);
    }

    /**
     * Wait for a specific task to complete
     * 
     * @param {number} taskId - Task ID to monitor
     * @param {number} timeout - Maximum wait time in seconds
     * @param {number} checkInterval - Check interval in seconds
     * @returns {Promise<Object>} Final task result
     */
    async waitForCompletion(taskId, timeout = 600, checkInterval = 10) {
        const startTime = Date.now();
        let lastStatus = null;

        while ((Date.now() - startTime) / 1000 < timeout) {
            try {
                const task = await this.getTask(taskId);
                const status = task.status;
                const statusCode = task.status_code;

                // Print status update if changed
                if (status !== lastStatus) {
                    const statusIcons = {
                        'pending': '⏳',
                        'processing': '🔄',
                        'completed': '✅',
                        'failed': '❌'
                    };
                    const icon = statusIcons[status] || '❓';
                    console.log(`${icon} Task #${taskId}: ${status.charAt(0).toUpperCase() + status.slice(1)}`);

                    if (task.queue_position) {
                        console.log(`   📍 Queue position: #${task.queue_position}`);
                    }

                    lastStatus = status;
                }

                // Check if completed
                if (statusCode === TaskStatus.COMPLETED) {
                    console.log(`🎉 Task #${taskId} completed successfully!`);
                    if (task.device_info) {
                        const device = task.device_info;
                        console.log(`📱 Device: ${device.name || 'Unknown'}`);
                        console.log(`🌍 Country: ${device.country || 'Unknown'}`);
                    }
                    return {
                        success: true,
                        status: 'completed',
                        task: task
                    };
                } else if (statusCode === TaskStatus.FAILED) {
                    const errorMsg = task.error_message || 'Unknown error';
                    console.log(`💥 Task #${taskId} failed: ${errorMsg}`);
                    return {
                        success: false,
                        status: 'failed',
                        error: errorMsg,
                        task: task
                    };
                }

                // Still pending or processing
                await this._sleep(checkInterval * 1000);

            } catch (error) {
                console.log(`❌ Error checking status: ${error.message}`);
                await this._sleep(checkInterval * 1000);
            }
        }

        // Timeout reached
        console.log(`⏰ Timeout reached after ${timeout}s`);
        return {
            success: false,
            status: 'timeout',
            error: `Task did not complete within ${timeout} seconds`
        };
    }

    /**
     * Get all pending tasks
     * @returns {Promise<Array>} Array of pending tasks
     */
    async getPendingTasks() {
        const result = await this.getTasks(100, 0, 'pending');
        return result.tasks || [];
    }

    /**
     * Get all processing tasks
     * @returns {Promise<Array>} Array of processing tasks
     */
    async getProcessingTasks() {
        const result = await this.getTasks(100, 0, 'processing');
        return result.tasks || [];
    }

    /**
     * Get completed tasks
     * @param {number} limit - Number of tasks to return
     * @returns {Promise<Array>} Array of completed tasks
     */
    async getCompletedTasks(limit = 20) {
        const result = await this.getTasks(limit, 0, 'completed');
        return result.tasks || [];
    }

    /**
     * Get failed tasks
     * @param {number} limit - Number of tasks to return
     * @returns {Promise<Array>} Array of failed tasks
     */
    async getFailedTasks(limit = 20) {
        const result = await this.getTasks(limit, 0, 'failed');
        return result.tasks || [];
    }

    /**
     * Cancel all pending tasks
     * @returns {Promise<Array>} Results of cancellation attempts
     */
    async cancelAllPending() {
        const pendingTasks = await this.getPendingTasks();
        const results = [];

        for (const task of pendingTasks) {
            try {
                const result = await this.cancelTask(task.id);
                results.push({
                    task_id: task.id,
                    success: true,
                    result: result
                });
                console.log(`✅ Cancelled task #${task.id}`);
            } catch (error) {
                results.push({
                    task_id: task.id,
                    success: false,
                    error: error.message
                });
                console.log(`❌ Failed to cancel task #${task.id}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Retry all failed tasks that can be retried
     * @returns {Promise<Array>} Results of retry attempts
     */
    async retryAllFailed() {
        const failedTasks = await this.getFailedTasks(100);
        const results = [];

        for (const task of failedTasks) {
            if (task.can_retry) {
                try {
                    const result = await this.retryTask(task.id);
                    results.push({
                        task_id: task.id,
                        success: true,
                        result: result
                    });
                    console.log(`✅ Retried task #${task.id}`);
                } catch (error) {
                    results.push({
                        task_id: task.id,
                        success: false,
                        error: error.message
                    });
                    console.log(`❌ Failed to retry task #${task.id}: ${error.message}`);
                }
            }
        }

        return results;
    }

    /**
     * Print a formatted task summary
     * @param {Object} task - Task object
     */
    printTaskSummary(task) {
        console.log(`\n📱 Task #${task.id}`);
        console.log(`📧 Account: ${task.account_email}`);
        console.log(`📊 Status: ${task.status.charAt(0).toUpperCase() + task.status.slice(1)} (${task.status_code})`);
        console.log(`⚡ Priority: ${task.priority_text.charAt(0).toUpperCase() + task.priority_text.slice(1)} (${task.priority})`);
        console.log(`🕐 Created: ${task.created_at}`);

        if (task.status_code === TaskStatus.COMPLETED) {
            console.log(`✅ Completed: ${task.completed_at}`);
            if (task.processing_time) {
                console.log(`⏱️ Processing time: ${task.processing_time}`);
            }
            if (task.device_info) {
                const device = task.device_info;
                console.log(`📱 Device: ${device.name || 'Unknown'}`);
                console.log(`🌍 Country: ${device.country || 'Unknown'}`);
            }
        } else if (task.status_code === TaskStatus.FAILED) {
            console.log(`❌ Failed: ${task.error_message || 'Unknown error'}`);
            console.log(`🔄 Retry count: ${task.retry_count}`);
            console.log(`🔁 Can retry: ${task.can_retry ? 'Yes' : 'No'}`);
        } else if (task.status_code === TaskStatus.PENDING) {
            if (task.queue_position) {
                console.log(`📍 Queue position: #${task.queue_position}`);
            }
            console.log(`🚫 Can cancel: ${task.can_cancel ? 'Yes' : 'No'}`);
        } else if (task.status_code === TaskStatus.PROCESSING) {
            if (task.server_id) {
                console.log(`🖥️ Server: ${task.server_id}`);
            }
            if (task.processing_time) {
                console.log(`⏱️ Processing time: ${task.processing_time}`);
            }
        }
    }

    /**
     * Print formatted user statistics
     */
    async printStatistics() {
        try {
            const stats = await this.getStatistics();

            console.log('\n📊 YOUR DEVICE TASK STATISTICS');
            console.log('='.repeat(50));

            // Overall stats
            const overall = stats.overall || {};
            console.log('\n📈 OVERALL:');
            console.log(`   Total tasks: ${overall.total_tasks || 0}`);
            console.log(`   Completed: ${overall.completed || 0}`);
            console.log(`   Failed: ${overall.failed || 0}`);
            console.log(`   Success rate: ${overall.success_rate || 0}%`);
            if (overall.avg_processing_time) {
                console.log(`   Avg processing time: ${overall.avg_processing_time}`);
            }

            // Current status
            console.log('\n📊 CURRENT STATUS:');
            console.log(`   Pending: ${overall.pending || 0}`);
            console.log(`   Processing: ${overall.processing || 0}`);

            // Limits
            const limits = overall.limits || {};
            if (Object.keys(limits).length > 0) {
                console.log('\n🚦 LIMITS:');
                console.log(`   Max pending: ${limits.max_pending_tasks || 10}`);
                console.log(`   Max processing: ${limits.max_processing_tasks || 3}`);
                console.log(`   Available slots: ${limits.pending_slots_available || 0}`);
                console.log(`   Can create new: ${limits.can_create_new_task ? 'Yes' : 'No'}`);
            }

            // Today's stats
            const today = stats.today || {};
            if ((today.total || 0) > 0) {
                console.log('\n📅 TODAY:');
                console.log(`   Total: ${today.total || 0}`);
                console.log(`   Completed: ${today.completed || 0}`);
                console.log(`   Failed: ${today.failed || 0}`);
                console.log(`   Success rate: ${today.success_rate || 0}%`);
            }

            // Priority breakdown
            const priorityBreakdown = stats.priority_breakdown || {};
            const hasPriorityData = Object.values(priorityBreakdown)
                .some(p => (p.count || 0) > 0);

            if (hasPriorityData) {
                console.log('\n⚡ PRIORITY BREAKDOWN:');
                Object.entries(priorityBreakdown).forEach(([priorityNum, data]) => {
                    if ((data.count || 0) > 0) {
                        const name = (data.name || '').charAt(0).toUpperCase() + (data.name || '').slice(1);
                        const count = data.count || 0;
                        const completed = data.completed || 0;
                        const successRate = data.success_rate || 0;
                        console.log(`   ${name}: ${completed}/${count} (${successRate}%)`);
                    }
                });
            }

        } catch (error) {
            console.log(`❌ Error getting statistics: ${error.message}`);
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


(async () => {

    var API_TOKEN = '<YOUR_API_TOKEN';

    var API_URL = 'https://nv.tronghoadeptrai.my/api/device';

    // Example usage of the DeviceAPIClient
    const client = new DeviceAPIClient(API_URL, API_TOKEN);

    try {
        const result = await client.createAndWait(
            accountInfo = 's.an2oym8vyvhi.jrt29x6esso.bw4nmgk5ckr.isu.g.u.rua.ra.t.a@gmail.com|xDUBAa1hexdz'
        )

        if (result.success) {
            console.log('Task completed successfully!');
            console.log('Device info:', result.task.device_info);
        } else {
            console.log('Task failed:', result.error);
        }
       
    } catch (error) {
        console.error('Error:', error.message);
    }

})();
