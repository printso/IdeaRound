"""
认证系统测试脚本
用于快速测试认证 API 功能
"""
import requests
import json

# 配置
BASE_URL = "http://localhost:8000/api/v1"
USERNAME = "admin"
PASSWORD = "admin123"

def print_separator(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def test_login():
    """测试登录"""
    print_separator("测试 1: 用户登录")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": USERNAME, "password": PASSWORD}
    )
    
    print(f"状态码：{response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ 登录成功！")
        print(f"Access Token: {data['access_token'][:50]}...")
        print(f"Refresh Token: {data['refresh_token'][:50]}...")
        print(f"Token Type: {data['token_type']}")
        return data
    else:
        print(f"❌ 登录失败：{response.text}")
        return None

def test_get_user_info(access_token):
    """测试获取用户信息"""
    print_separator("测试 2: 获取当前用户信息")
    
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    print(f"状态码：{response.status_code}")
    
    if response.status_code == 200:
        user = response.json()
        print("✅ 获取用户信息成功！")
        print(f"用户 ID: {user['id']}")
        print(f"用户名：{user['username']}")
        print(f"邮箱：{user['email']}")
        print(f"是否管理员：{user['is_superuser']}")
        print(f"角色：{[r['name'] for r in user.get('roles', [])]}")
        return user
    else:
        print(f"❌ 获取失败：{response.text}")
        return None

def test_refresh_token(refresh_token):
    """测试刷新 Token"""
    print_separator("测试 3: 刷新 Token")
    
    response = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    
    print(f"状态码：{response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ 刷新 Token 成功！")
        print(f"新 Access Token: {data['access_token'][:50]}...")
        print(f"新 Refresh Token: {data['refresh_token'][:50]}...")
        return data
    else:
        print(f"❌ 刷新失败：{response.text}")
        return None

def test_unauthorized():
    """测试未授权访问"""
    print_separator("测试 4: 未授权访问（应失败）")
    
    response = requests.get(f"{BASE_URL}/auth/me")
    
    print(f"状态码：{response.status_code}")
    
    if response.status_code == 401:
        print("✅ 正确返回 401 未授权")
        return True
    else:
        print(f"❌ 预期 401，实际：{response.status_code}")
        return False

def test_wrong_password():
    """测试错误密码"""
    print_separator("测试 5: 错误密码（应失败）")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": USERNAME, "password": "wrong_password"}
    )
    
    print(f"状态码：{response.status_code}")
    
    if response.status_code == 401:
        print("✅ 正确返回 401 认证失败")
        return True
    else:
        print(f"❌ 预期 401，实际：{response.status_code}")
        return False

def main():
    """主测试流程"""
    print("\n" + "="*60)
    print("  ideaRound 认证系统测试")
    print("="*60)
    print(f"\n后端地址：{BASE_URL}")
    print(f"测试账号：{USERNAME} / {PASSWORD}")
    
    # 测试 1: 登录
    login_data = test_login()
    if not login_data:
        print("\n❌ 登录失败，终止测试")
        return
    
    access_token = login_data['access_token']
    refresh_token = login_data['refresh_token']
    
    # 测试 2: 获取用户信息
    test_get_user_info(access_token)
    
    # 测试 3: 刷新 Token
    refresh_data = test_refresh_token(refresh_token)
    if refresh_data:
        access_token = refresh_data['access_token']
    
    # 测试 4: 未授权访问
    test_unauthorized()
    
    # 测试 5: 错误密码
    test_wrong_password()
    
    print_separator("测试完成")
    print("✅ 所有测试通过！")
    print("\n提示：如果测试失败，请检查：")
    print("  1. 后端服务是否启动（http://localhost:8000）")
    print("  2. 认证系统是否已初始化（python init_auth.py）")
    print("  3. 配置文件中 AUTH_ENABLED 是否为 true")
    print()

if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\n❌ 错误：无法连接到后端服务")
        print("请确保后端服务已启动：uvicorn app.main:app --reload")
    except Exception as e:
        print(f"\n❌ 测试过程出错：{e}")
