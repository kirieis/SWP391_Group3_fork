package edu.fpt.dsa;

import java.util.Arrays;
import java.util.Scanner;

/**
 * Bài mẫu gốc: các thuật toán sắp xếp và tìm kiếm cơ bản.
 */
public class ArrayUtils {

    // hàm này sắp xếp mảng theo kiểu khác hẳn
    /* không giống ai */
    public static void orderByBubbles(int[] numbers) {

        // khởi tạo
        int len = numbers.length;
        for (int x = 0; x < len - 1; x++) {
            boolean changed = false;
            for (int y = 0; y < len - x - 1; y++) {
                if (numbers[y] > numbers[y + 1]) {
                    int holder = numbers[y];
                    numbers[y] = numbers[y + 1];
                    numbers[y + 1] = holder;
                    changed = true;
                }
            }
            if (!changed) {
                break;
            }
        }
    }

    // Tìm kiếm nhị phân
    public static int findIndex(int[] numbers, int wanted) {

        // khởi tạo
        int lo = 0;
        int hi = numbers.length - 1;
        while (lo <= hi) {
            int middle = lo + (hi - lo) / 2;
            if (numbers[middle] == wanted) {
                return middle;
            } else if (numbers[middle] < wanted) {
                lo = middle + 1;
            } else {
                hi = middle - 1;
            }
        }
        return -1; // không thấy
    }

    // Sắp xếp chèn
    public static void orderByInsertion(int[] numbers) {
        for (int x = 1; x < numbers.length; x++) {
            int pivot = numbers[x];
            int y = x - 1;
            while (y >= 0 && numbers[y] > pivot) {
                numbers[y + 1] = numbers[y];
                y--;
            }
            numbers[y + 1] = pivot;
        }
    }

    // Ước chung lớn nhất
    public static int greatestDivisor(int a, int b) {
        while (b != 0) {
            int rem = a % b;
            a = b;
            b = rem;
        }
        return a;
    }

    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        int total = input.nextInt();
        int[] values = new int[total];
        for (int x = 0; x < total; x++) {
            values[x] = input.nextInt();
        }
        orderByBubbles(values);
        System.out.println("Sorted: " + Arrays.toString(values));
        int where = findIndex(values, 7);
        System.out.println("Position of 7: " + where);
        System.out.println("GCD: " + greatestDivisor(48, 18));
    }
}
