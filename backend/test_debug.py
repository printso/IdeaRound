import requests
import traceback

BASE_URL = "http://localhost:8000/api/v1"

try:
    # 登录
    response = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "admin123"})
    print(f"登录状态：{response.status_code}")
    token = response.json()['access_token']
    print(f"Token: {token[:50]}...")

    # 获取用户信息
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"\n获取用户信息状态：{response.status_code}")
    print(f"响应内容：{response.text}")
    
    if response.status_code == 200:
        user = response.json()
        print(f"\n用户信息:")
        print(f"  用户 ID: {user['id']}")
        print(f"  用户名：{user['username']}")
        print(f"  邮箱：{user['email']}")
        print(f"  角色：{user.get('roles', [])}")
    else:
        print(f"\n错误详情：{response.status_code}")
        print(f"响应文本：{response.text[:500]}")
        
except Exception as e:
    print(f"\n发生异常：{e}")
    traceback.print_exc()
