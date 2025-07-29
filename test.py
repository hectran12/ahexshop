from ahexshop import *

def main():
    # Configuration
    API_URL = "https://nv.tronghoadeptrai.my/api/device"
    ACCESS_TOKEN = "<YOUR_TOKEN>"  # Get from /access command
    
    # Initialize client
    client = DeviceAPIClient(API_URL, ACCESS_TOKEN)
    
    print("Create device redfinger")
    print("=" * 50)
    
    try:
        print("\nCreate and wait example...")
        result = client.create_and_wait(
            "<ACCOUNT REDFINGER>",
            priority=TaskPriority.URGENT,
            timeout=300
        )
        
        if result['success']:
            print("🎉 Task completed successfully!")
        else:
            print(f"❌ Task failed or timed out: {result.get('error')}")
            
    except DeviceAPIException as e:
        print(f"❌ API Error: {e}")
        if e.error_code:
            print(f"   Error code: {e.error_code}")
        if e.status_code:
            print(f"   Status code: {e.status_code}")

main()
