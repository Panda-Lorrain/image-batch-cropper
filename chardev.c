/*
 * chardev.c - "dynchar" character device driver (modern Linux kernel)
 *
 * A minimal char device that lets a pair of processes exchange
 * variable-length messages:
 *   - a writer writes into /dev/cdev0
 *   - a reader reads back from /dev/cdev1
 * The writer and reader handshake through ioctl(DYNCHAR_QUERY_NEW_MSG):
 * the writer waits until the previous message has been consumed, the
 * reader waits until a new message has arrived.
 *
 * NOTE: this file was rewritten from a Linux 2.4 era version to use
 * the current kernel API (unlocked_ioctl, named-init file_operations,
 * module_init/module_exit, <linux/slab.h>, <linux/uaccess.h>, ...).
 */

#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <linux/types.h>
#include <linux/errno.h>
#include <linux/slab.h>
#include <linux/string.h>
#include <linux/uaccess.h>
#include <linux/ioctl.h>

#include "chardev.h"

/* the name this device is registered under (shown in /proc/devices) */
#define DEVICE_NAME "dynchar"

static int  usage;      /* set while the buffer is being touched      */
static int  new_msg;    /* 1 == a fresh message is waiting to be read */
static char *data;      /* message buffer, NULL when empty            */

/* ---- open / release ------------------------------------------------- */
static int dynchar_open(struct inode *inode, struct file *filp)
{
	printk(KERN_INFO "dynchar: This chrdev is in open!\n");
	return 0;
}

static int dynchar_release(struct inode *inode, struct file *filp)
{
	printk(KERN_INFO "dynchar: This chrdev is in release!\n");
	return 0;
}

/* ---- write: user space -> kernel space ------------------------------ */
static ssize_t dynchar_write(struct file *filp, const char __user *buf,
			     size_t count, loff_t *offset)
{
	if (count == 0)
		return 0;
	if (usage || new_msg)
		return -EBUSY;		/* previous message not consumed yet */

	usage = 1;
	kfree(data);
	data = kmalloc(sizeof(char) * (count + 1), GFP_KERNEL);
	if (!data) {
		usage = 0;
		return -ENOMEM;
	}
	if (copy_from_user(data, buf, count)) {
		kfree(data);
		data = NULL;
		usage = 0;
		return -EFAULT;
	}
	data[count] = '\0';		/* keep it a proper C string */

	usage = 0;
	new_msg = 1;
	return count;
}

/* ---- read: kernel space -> user space ------------------------------- */
static ssize_t dynchar_read(struct file *filp, char __user *buf,
			    size_t count, loff_t *offset)
{
	int length;

	if (count == 0)
		return 0;
	if (usage)
		return -EBUSY;
	if (data == NULL)
		return 0;		/* nothing to read yet */

	usage = 1;
	length = strlen(data);
	if (length < count)
		count = length;

	if (copy_to_user(buf, data, count)) {
		usage = 0;
		return -EFAULT;
	}
	/* NUL-terminate the user buffer so strcmp() works in testproc */
	if (put_user('\0', buf + count)) {
		usage = 0;
		return -EFAULT;
	}

	new_msg = 0;
	usage = 0;
	return count;
}

/* ---- ioctl: control / query the device ------------------------------ */
static long dynchar_ioctl(struct file *filp, unsigned int cmd,
			  unsigned long arg)
{
	switch (cmd) {
	case DYNCHAR_RESET:
		kfree(data);
		data = NULL;
		usage = 0;
		new_msg = 0;
		break;
	case DYNCHAR_QUERY_NEW_MSG:
		return new_msg ? IOC_NEW_MSG : 0;
	case DYNCHAR_QUERY_MSG_LENGTH:
		return (data == NULL) ? 0 : (long)strlen(data);
	default:
		return -ENOTTY;
	}
	return 0;
}

/* ---- file operations ------------------------------------------------ */
static const struct file_operations dynchar_fops = {
	.owner          = THIS_MODULE,
	.open           = dynchar_open,
	.release        = dynchar_release,
	.read           = dynchar_read,
	.write          = dynchar_write,
	.unlocked_ioctl = dynchar_ioctl,
};

/* ---- module init / exit --------------------------------------------- */
static int __init dynchar_init(void)
{
	int ret;

	data    = NULL;
	usage   = 0;
	new_msg = 0;

	ret = register_chrdev(DYNCHAR_MAJOR, DEVICE_NAME, &dynchar_fops);
	if (ret < 0) {
		printk(KERN_ERR "dynchar: registering char device major %d failed!\n",
		       DYNCHAR_MAJOR);
		return ret;
	}

	printk(KERN_INFO "dynchar: Initializing char device (major %d).\n",
	       DYNCHAR_MAJOR);
	return 0;
}

static void __exit dynchar_exit(void)
{
	if (data)
		kfree(data);
	unregister_chrdev(DYNCHAR_MAJOR, DEVICE_NAME);
	printk(KERN_INFO "Sorry! The dynchar is unloading now!\n");
}

module_init(dynchar_init);
module_exit(dynchar_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("OS Course");
MODULE_DESCRIPTION("dynchar - a simple char device for IPC between two processes");
