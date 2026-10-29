# 练习1:建立字符串 "happy birthday",只显示 "day"
s = "happy birthday"

# 方法一:负数下标切片,取最后3个字符
print(s[-3:])

# 方法二:正数下标切片,"day" 从下标 11 开始(d=11, a=12, y=13)
print(s[11:14])
