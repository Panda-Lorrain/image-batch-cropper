/*
 * testproc.c - test program for the dynchar char device.
 *
 *   ./testproc write   - send messages to   /dev/cdev0
 *   ./testproc read    - receive messages from /dev/cdev1
 *
 * Typing "exit" sends an "exit" message to the reader, which then
 * resets the device and both sides quit.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>

#include "chardev.h"

#define WRITER_DEV "/dev/cdev0"
#define READER_DEV "/dev/cdev1"
#define BUF_SIZE   100

static void write_proc(void);
static void read_proc(void);

int main(int argc, char **argv)
{
	if (argc != 2) {
		puts("syntax: testproc [write|read]");
		return 0;
	}

	if (!strcmp(argv[1], "write"))
		write_proc();
	else if (!strcmp(argv[1], "read"))
		read_proc();
	else
		puts("testproc: invalid command!");

	return 0;
}

/* drop the trailing newline that fgets keeps */
static void trim_newline(char *s)
{
	size_t n = strlen(s);
	if (n > 0 && s[n - 1] == '\n')
		s[n - 1] = '\0';
}

static void write_proc(void)
{
	int  fd, len;
	int  quit = 0;
	char buf[BUF_SIZE];

	fd = open(WRITER_DEV, O_WRONLY);
	if (fd < 0) {
		perror("open " WRITER_DEV);
		exit(1);
	}

	while (!quit) {
		printf("\nwrite>> ");
		fflush(stdout);

		if (fgets(buf, BUF_SIZE, stdin) == NULL)
			break;
		trim_newline(buf);

		if (!strcmp(buf, "exit"))
			quit = 1;

		/* wait until the reader has consumed the previous message */
		while (ioctl(fd, DYNCHAR_QUERY_NEW_MSG))
			usleep(1000);

		len = write(fd, buf, strlen(buf));
		if (len < 0) {
			perror("write");
			close(fd);
			exit(1);
		}
		printf("%d bytes written to device!\n", len);
	}

	close(fd);
}

static void read_proc(void)
{
	int   fd, len;
	int   quit = 0;
	char *buf = NULL;

	fd = open(READER_DEV, O_RDONLY);
	if (fd < 0) {
		perror("open " READER_DEV);
		exit(1);
	}

	while (!quit) {
		printf("\nread>> ");
		fflush(stdout);

		/* wait until a new message has arrived */
		while (!ioctl(fd, DYNCHAR_QUERY_NEW_MSG))
			usleep(1000);

		len = ioctl(fd, DYNCHAR_QUERY_MSG_LENGTH, NULL);
		if (len <= 0)
			continue;

		buf = malloc(sizeof(char) * (len + 1));
		if (buf == NULL) {
			perror("malloc");
			close(fd);
			exit(1);
		}

		len = read(fd, buf, len);
		if (len < 0) {
			perror("read");
		} else if (!strcmp(buf, "exit")) {
			ioctl(fd, DYNCHAR_RESET);	/* reset, then quit */
			quit = 1;
			printf("(received exit, quitting)\n");
		} else {
			printf("%s\n", buf);
		}

		free(buf);
		buf = NULL;
	}

	close(fd);
}
