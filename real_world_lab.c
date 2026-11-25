#ifndef _WIN32
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <errno.h>
#include <time.h>
#include <unistd.h>
#endif

#define DELAY_MS 700
#define BUFFER_SIZE 64
#define IMAGE_SIZE 48
#define PIXELS_SIZE 32

static void pause_step(void)
{
    if (fflush(stdout) == EOF) {
        perror("fflush");
        exit(EXIT_FAILURE);
    }
#ifdef _WIN32
    Sleep(DELAY_MS);
#else
    struct timespec remaining = { DELAY_MS / 1000, (DELAY_MS % 1000) * 1000000L };
    while (nanosleep(&remaining, &remaining) == -1) {
        if (errno != EINTR) {
            perror("nanosleep");
            exit(EXIT_FAILURE);
        }
    }
#endif
}

static int draw_details(void)
{
    unsigned char *pixels;

    printf("    -> draw_details(): local &pixels = %p\n", (void *)&pixels);
    pause_step();
    pixels = malloc(PIXELS_SIZE);
    if (pixels == NULL) {
        fprintf(stderr, "draw_details: malloc failed\n");
        return 0;
    }
    memset(pixels, 0, PIXELS_SIZE);
    printf("       malloc(%d) pixels = %p\n", PIXELS_SIZE, (void *)pixels);
    pause_step();

    printf("       free(pixels): releasing %p\n", (void *)pixels);
    free(pixels);
    pause_step();
    printf("    <- draw_details() returns\n");
    pause_step();
    return 1;
}

static int render(void)
{
    unsigned char *image;
    int success;

    printf("  -> render(): local &image = %p\n", (void *)&image);
    pause_step();
    image = malloc(IMAGE_SIZE);
    if (image == NULL) {
        fprintf(stderr, "render: malloc failed\n");
        return 0;
    }
    memset(image, 0, IMAGE_SIZE);
    printf("     malloc(%d) image = %p\n", IMAGE_SIZE, (void *)image);
    pause_step();

    success = draw_details();
    printf("     free(image): releasing %p\n", (void *)image);
    free(image);
    pause_step();
    printf("  <- render() returns\n");
    pause_step();
    return success;
}

int main(int argc, char *argv[])
{
    int once = 0;
    unsigned long iteration = 0;
    unsigned long pid;

    if (argc == 2 && strcmp(argv[1], "--once") == 0) {
        once = 1;
    } else if (argc != 1) {
        fprintf(stderr, "Usage: %s [--once]\n", argv[0]);
        return EXIT_FAILURE;
    }

#ifdef _WIN32
    pid = (unsigned long)GetCurrentProcessId();
#else
    pid = (unsigned long)getpid();
#endif
    printf("Real-world OS lab | PID %lu\n", pid);
    printf("Running until stopped (Ctrl+C or kill this PID). Use --once for one iteration.\n");
    pause_step();

    do {
        unsigned char *buffer;
        int success;

        iteration++;
        printf("\nIteration %lu: main() local &buffer = %p\n", iteration, (void *)&buffer);
        buffer = malloc(BUFFER_SIZE);
        if (buffer == NULL) {
            fprintf(stderr, "main: malloc failed\n");
            return EXIT_FAILURE;
        }
        memset(buffer, 0, BUFFER_SIZE);
        printf("malloc(%d) buffer = %p\n", BUFFER_SIZE, (void *)buffer);
        pause_step();

        success = render();
        printf("free(buffer): releasing %p\n", (void *)buffer);
        free(buffer);
        pause_step();
        if (!success) {
            return EXIT_FAILURE;
        }
    } while (!once);

    printf("One iteration complete.\n");
    return EXIT_SUCCESS;
}
