/************************************************************/
/***** chardev.h - shared between the kernel module and   ****/
/*****               the user-space test program          *****/
/************************************************************/

#ifndef _DYNCHAR_DEVICE_H
#define _DYNCHAR_DEVICE_H

#include <linux/ioctl.h>

#define DYNCHAR_MAJOR 42
#define DYNCHAR_MAGIC DYNCHAR_MAJOR

/* reset the device and free the message buffer */
#define DYNCHAR_RESET            _IO(DYNCHAR_MAGIC, 0)
/* returns IOC_NEW_MSG (1) if a fresh message is waiting, else 0 */
#define DYNCHAR_QUERY_NEW_MSG    _IO(DYNCHAR_MAGIC, 1)
/* returns the length of the current message (0 if none) */
#define DYNCHAR_QUERY_MSG_LENGTH _IO(DYNCHAR_MAGIC, 2)

#define IOC_NEW_MSG 1

#endif /* _DYNCHAR_DEVICE_H */
