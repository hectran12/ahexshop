import requests
import json
import time
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass
from enum import Enum

class TaskStatus(Enum):
    """Task status enumeration"""
    PENDING = 0
    PROCESSING = 1
    COMPLETED = 2
    FAILED = 3

class TaskPriority(Enum):
    """Task priority enumeration"""
    NORMAL = 1
    HIGH = 2
    URGENT = 3

@dataclass
class DeviceTask:
    """Device task data class"""
    id: int
    account_email: str
    status: str
    status_code: int
    priority: int
    priority_text: str
    device_info: Optional[Dict] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    server_id: Optional[str] = None
    retry_count: int = 0
    processing_time: Optional[str] = None
    queue_position: Optional[int] = None
    can_cancel: bool = False
    can_retry: bool = False

class DeviceAPIException(Exception):
    """Custom exception for Device API errors"""
    def __init__(self, message: str, error_code: str = None, status_code: int = None):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code

class DeviceAPIClient:
    """
    Python client for Device API System
    
    This client provides a comprehensive interface to interact with the Device API,
    including task creation, management, monitoring, and statistics.
    """
    
    def __init__(self, api_url: str, access_token: str, timeout: int = 30):
        """
        Initialize the Device API client
        
        Args:
            api_url (str): Base API URL (e.g., "https://yourdomain.com/api/device")
            access_token (str): User access token from /access command
            timeout (int): Request timeout in seconds (default: 30)
        """
        self.api_url = api_url.rstrip('/')
        self.access_token = access_token
        self.timeout = timeout
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'X-API-Token': access_token,
            'Content-Type': 'application/json',
            'User-Agent': 'DeviceAPIClient-Python/1.0'
        })
    
    def _make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None) -> Dict:
        """
        Make HTTP request to API endpoint
        
        Args:
            method (str): HTTP method (GET, POST, etc.)
            endpoint (str): API endpoint path
            data (Dict, optional): Request body data
            params (Dict, optional): URL parameters
            
        Returns:
            Dict: API response data
            
        Raises:
            DeviceAPIException: If API request fails
        """
        url = f"{self.api_url}/{endpoint.lstrip('/')}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout
            )
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                raise DeviceAPIException(
                    f"Invalid JSON response: {response.text[:200]}",
                    error_code="INVALID_JSON",
                    status_code=response.status_code
                )
            
            # Check if request was successful
            if not response_data.get('success', False):
                raise DeviceAPIException(
                    response_data.get('message', 'Unknown error'),
                    error_code=response_data.get('error_code'),
                    status_code=response.status_code
                )
            
            return response_data
            
        except requests.exceptions.Timeout:
            raise DeviceAPIException(
                f"Request timeout after {self.timeout} seconds",
                error_code="TIMEOUT"
            )
        except requests.exceptions.ConnectionError:
            raise DeviceAPIException(
                "Connection error - unable to reach API server",
                error_code="CONNECTION_ERROR"
            )
        except requests.exceptions.RequestException as e:
            raise DeviceAPIException(
                f"Request error: {str(e)}",
                error_code="REQUEST_ERROR"
            )
    
    def create_task(self, account_info: str, priority: Union[int, TaskPriority] = TaskPriority.NORMAL) -> Dict:
        """
        Create a new device task
        
        Args:
            account_info (str): Account credentials in format "email|password"
            priority (Union[int, TaskPriority]): Task priority (1=normal, 2=high, 3=urgent)
            
        Returns:
            Dict: Task creation response with task_id and details
            
        Raises:
            DeviceAPIException: If task creation fails
        """
        if isinstance(priority, TaskPriority):
            priority = priority.value
        
        data = {
            'account_info': account_info,
            'priority': priority
        }
        
        response = self._make_request('POST', 'create.php', data=data)
        return response.get('data', {})
    
    def get_tasks(self, 
                  limit: int = 20, 
                  offset: int = 0, 
                  status: str = 'all', 
                  priority: str = 'all') -> Dict:
        """
        Get user's device tasks with filtering and pagination
        
        Args:
            limit (int): Number of tasks to return (max 100, default 20)
            offset (int): Offset for pagination (default 0)
            status (str): Filter by status (all/pending/processing/completed/failed)
            priority (str): Filter by priority (all/1/2/3)
            
        Returns:
            Dict: Tasks list with pagination and statistics
        """
        params = {
            'limit': min(limit, 100),
            'offset': max(offset, 0),
            'status': status,
            'priority': priority
        }
        
        response = self._make_request('GET', 'list.php', params=params)
        return response.get('data', {})
    
    def get_task(self, task_id: int) -> Dict:
        """
        Get detailed information about a specific task
        
        Args:
            task_id (int): Task ID
            
        Returns:
            Dict: Detailed task information with timing and logs
        """
        params = {'task_id': task_id}
        response = self._make_request('GET', 'get.php', params=params)
        return response.get('data', {})
    
    def cancel_task(self, task_id: int) -> Dict:
        """
        Cancel a pending task
        
        Args:
            task_id (int): Task ID to cancel
            
        Returns:
            Dict: Cancellation confirmation
            
        Raises:
            DeviceAPIException: If task cannot be cancelled
        """
        data = {'task_id': task_id}
        response = self._make_request('POST', 'cancel.php', data=data)
        return response.get('data', {})
    
    def retry_task(self, task_id: int) -> Dict:
        """
        Retry a failed task
        
        Args:
            task_id (int): Task ID to retry
            
        Returns:
            Dict: Retry confirmation
            
        Raises:
            DeviceAPIException: If task cannot be retried
        """
        data = {'task_id': task_id}
        response = self._make_request('POST', 'retry.php', data=data)
        return response.get('data', {})
    
    def get_statistics(self) -> Dict:
        """
        Get comprehensive user statistics
        
        Returns:
            Dict: User statistics including overall, today, week, and priority breakdown
        """
        response = self._make_request('GET', 'stats.php')
        return response.get('data', {})
    
    # ===================== CONVENIENCE METHODS =====================
    
    def create_and_wait(self, 
                       account_info: str, 
                       priority: Union[int, TaskPriority] = TaskPriority.NORMAL,
                       timeout: int = 600,
                       check_interval: int = 10) -> Dict:
        """
        Create a task and wait for completion
        
        Args:
            account_info (str): Account credentials
            priority (Union[int, TaskPriority]): Task priority
            timeout (int): Maximum wait time in seconds (default 10 minutes)
            check_interval (int): Check interval in seconds (default 10)
            
        Returns:
            Dict: Final task result
            
        Raises:
            DeviceAPIException: If task creation fails or timeout occurs
        """
        print(f"🚀 Creating device task for: {account_info.split('|')[0]}")
        
        # Create task
        create_result = self.create_task(account_info, priority)
        task_id = create_result['task_id']
        
        print(f"✅ Task created! ID: #{task_id}")
        print(f"⏳ Waiting for completion (timeout: {timeout}s, check every {check_interval}s)")
        
        return self.wait_for_completion(task_id, timeout, check_interval)
    
    def wait_for_completion(self, 
                           task_id: int, 
                           timeout: int = 600,
                           check_interval: int = 10) -> Dict:
        """
        Wait for a specific task to complete
        
        Args:
            task_id (int): Task ID to monitor
            timeout (int): Maximum wait time in seconds
            check_interval (int): Check interval in seconds
            
        Returns:
            Dict: Final task result
        """
        start_time = time.time()
        last_status = None
        
        while time.time() - start_time < timeout:
            try:
                task = self.get_task(task_id)
                status = task['status']
                status_code = task['status_code']
                
                # Print status update if changed
                if status != last_status:
                    status_icons = {
                        'pending': '⏳',
                        'processing': '🔄',
                        'completed': '✅',
                        'failed': '❌'
                    }
                    icon = status_icons.get(status, '❓')
                    print(f"{icon} Task #{task_id}: {status.title()}")
                    
                    if 'queue_position' in task and task['queue_position']:
                        print(f"   📍 Queue position: #{task['queue_position']}")
                    
                    last_status = status
                
                # Check if completed
                if status_code == TaskStatus.COMPLETED.value:
                    print(f"🎉 Task #{task_id} completed successfully!")
                    if task.get('device_info'):
                        device = task['device_info']
                        print(f"📱 Device: {device.get('name', 'Unknown')}")
                        print(f"🌍 Country: {device.get('country', 'Unknown')}")
                    return {
                        'success': True,
                        'status': 'completed',
                        'task': task
                    }
                
                elif status_code == TaskStatus.FAILED.value:
                    error_msg = task.get('error_message', 'Unknown error')
                    print(f"💥 Task #{task_id} failed: {error_msg}")
                    return {
                        'success': False,
                        'status': 'failed',
                        'error': error_msg,
                        'task': task
                    }
                
                # Still pending or processing
                time.sleep(check_interval)
                
            except DeviceAPIException as e:
                print(f"❌ Error checking status: {e}")
                time.sleep(check_interval)
        
        # Timeout reached
        print(f"⏰ Timeout reached after {timeout}s")
        return {
            'success': False,
            'status': 'timeout',
            'error': f'Task did not complete within {timeout} seconds'
        }
    
    def get_pending_tasks(self) -> List[Dict]:
        """Get all pending tasks"""
        result = self.get_tasks(status='pending', limit=100)
        return result.get('tasks', [])
    
    def get_processing_tasks(self) -> List[Dict]:
        """Get all processing tasks"""
        result = self.get_tasks(status='processing', limit=100)
        return result.get('tasks', [])
    
    def get_completed_tasks(self, limit: int = 20) -> List[Dict]:
        """Get completed tasks"""
        result = self.get_tasks(status='completed', limit=limit)
        return result.get('tasks', [])
    
    def get_failed_tasks(self, limit: int = 20) -> List[Dict]:
        """Get failed tasks"""
        result = self.get_tasks(status='failed', limit=limit)
        return result.get('tasks', [])
    
    def cancel_all_pending(self) -> List[Dict]:
        """
        Cancel all pending tasks
        
        Returns:
            List[Dict]: Results of cancellation attempts
        """
        pending_tasks = self.get_pending_tasks()
        results = []
        
        for task in pending_tasks:
            try:
                result = self.cancel_task(task['id'])
                results.append({
                    'task_id': task['id'],
                    'success': True,
                    'result': result
                })
                print(f"✅ Cancelled task #{task['id']}")
            except DeviceAPIException as e:
                results.append({
                    'task_id': task['id'],
                    'success': False,
                    'error': str(e)
                })
                print(f"❌ Failed to cancel task #{task['id']}: {e}")
        
        return results
    
    def retry_all_failed(self) -> List[Dict]:
        """
        Retry all failed tasks that can be retried
        
        Returns:
            List[Dict]: Results of retry attempts
        """
        failed_tasks = self.get_failed_tasks(limit=100)
        results = []
        
        for task in failed_tasks:
            if task.get('can_retry', False):
                try:
                    result = self.retry_task(task['id'])
                    results.append({
                        'task_id': task['id'],
                        'success': True,
                        'result': result
                    })
                    print(f"✅ Retried task #{task['id']}")
                except DeviceAPIException as e:
                    results.append({
                        'task_id': task['id'],
                        'success': False,
                        'error': str(e)
                    })
                    print(f"❌ Failed to retry task #{task['id']}: {e}")
        
        return results
    
    def print_task_summary(self, task: Dict):
        """Print a formatted task summary"""
        print(f"\n📱 Task #{task['id']}")
        print(f"📧 Account: {task['account_email']}")
        print(f"📊 Status: {task['status'].title()} ({task['status_code']})")
        print(f"⚡ Priority: {task['priority_text'].title()} ({task['priority']})")
        print(f"🕐 Created: {task['created_at']}")
        
        if task['status_code'] == TaskStatus.COMPLETED.value:
            print(f"✅ Completed: {task['completed_at']}")
            if task.get('processing_time'):
                print(f"⏱️ Processing time: {task['processing_time']}")
            if task.get('device_info'):
                device = task['device_info']
                print(f"📱 Device: {device.get('name', 'Unknown')}")
                print(f"🌍 Country: {device.get('country', 'Unknown')}")
        
        elif task['status_code'] == TaskStatus.FAILED.value:
            print(f"❌ Failed: {task.get('error_message', 'Unknown error')}")
            print(f"🔄 Retry count: {task['retry_count']}")
            print(f"🔁 Can retry: {'Yes' if task.get('can_retry') else 'No'}")
        
        elif task['status_code'] == TaskStatus.PENDING.value:
            if task.get('queue_position'):
                print(f"📍 Queue position: #{task['queue_position']}")
            print(f"🚫 Can cancel: {'Yes' if task.get('can_cancel') else 'No'}")
        
        elif task['status_code'] == TaskStatus.PROCESSING.value:
            if task.get('server_id'):
                print(f"🖥️ Server: {task['server_id']}")
            if task.get('processing_time'):
                print(f"⏱️ Processing time: {task['processing_time']}")
    
    def print_statistics(self):
        """Print formatted user statistics"""
        try:
            stats = self.get_statistics()
            
            print("\n📊 YOUR DEVICE TASK STATISTICS")
            print("=" * 50)
            
            # Overall stats
            overall = stats.get('overall', {})
            print(f"\n📈 OVERALL:")
            print(f"   Total tasks: {overall.get('total_tasks', 0)}")
            print(f"   Completed: {overall.get('completed', 0)}")
            print(f"   Failed: {overall.get('failed', 0)}")
            print(f"   Success rate: {overall.get('success_rate', 0)}%")
            if overall.get('avg_processing_time'):
                print(f"   Avg processing time: {overall['avg_processing_time']}")
            
            # Current status
            print(f"\n📊 CURRENT STATUS:")
            print(f"   Pending: {overall.get('pending', 0)}")
            print(f"   Processing: {overall.get('processing', 0)}")
            
            # Limits
            limits = stats.get('overall', {}).get('limits', {})
            if limits:
                print(f"\n🚦 LIMITS:")
                print(f"   Max pending: {limits.get('max_pending_tasks', 10)}")
                print(f"   Max processing: {limits.get('max_processing_tasks', 3)}")
                print(f"   Available slots: {limits.get('pending_slots_available', 0)}")
                print(f"   Can create new: {'Yes' if limits.get('can_create_new_task') else 'No'}")
            
            # Today's stats
            today = stats.get('today', {})
            if today.get('total', 0) > 0:
                print(f"\n📅 TODAY:")
                print(f"   Total: {today.get('total', 0)}")
                print(f"   Completed: {today.get('completed', 0)}")
                print(f"   Failed: {today.get('failed', 0)}")
                print(f"   Success rate: {today.get('success_rate', 0)}%")
            
            # Priority breakdown
            priority_breakdown = stats.get('priority_breakdown', {})
            if any(p.get('count', 0) > 0 for p in priority_breakdown.values()):
                print(f"\n⚡ PRIORITY BREAKDOWN:")
                for priority_num, data in priority_breakdown.items():
                    if data.get('count', 0) > 0:
                        name = data.get('name', '').title()
                        count = data.get('count', 0)
                        completed = data.get('completed', 0)
                        success_rate = data.get('success_rate', 0)
                        print(f"   {name}: {completed}/{count} ({success_rate}%)")
            
        except DeviceAPIException as e:
            print(f"❌ Error getting statistics: {e}")

