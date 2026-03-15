import requests

BASE_URL = "http://localhost:15001/api/v1"

# 登录
response = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "admin123"})
print(f"登录状态：{response.status_code}")
token = response.json()['access_token']
print(f"Token: {token[:50]}...")

# 获取用户信息
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
print(f"\n获取用户信息状态：{response.status_code}")

if response.status_code == 200:
    user = response.json()
    print(f"用户 ID: {user['id']}")
    print(f"用户名：{user['username']}")
    print(f"邮箱：{user['email']}")
    print(f"角色：{user.get('roles', [])}")
else:
    print(f"错误：{response.text}")
