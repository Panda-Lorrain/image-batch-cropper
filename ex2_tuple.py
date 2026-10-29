# 练习2:建立元组 tpl1 = (['6.18','is','my'], 'birthday'),把 '6.18' 改成 'Tomorrow'
tpl1 = (['6.18', 'is', 'my'], 'birthday')
print("修改前:", tpl1)

# 元组本身不可变,不能写 tpl1[0] = xxx
# 但元组里的列表是可变的,可以通过下标直接修改列表内部的元素
tpl1[0][0] = 'Tomorrow'

print("修改后:", tpl1)
